import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { IconGrip, IconRefresh, IconX } from "@/components/icons";
import type { TerminalSession } from "@/lib/types";
import { clientError } from "@/lib/errors";
import { useSpace } from "@/features/workspace/SpaceContext";
import { resizeTerminalSession, writeTerminalSession } from "../api";
import {
  formatPathsForPty,
  payloadFromDataTransfer,
  registerTerminalOsDropTarget,
} from "../drop";
import { bracketedPaste, payloadFromClipboardSnapshot, payloadFromFileList, snapshotClipboard } from "../paste";
import { nextXtermMountDelay } from "../spawnQueue";
import type { TerminalExitEvent, TerminalOutputEvent } from "../types";
import { readXtermTheme } from "../xtermTheme";

function keyEventToPty(event: KeyboardEvent): string | null {
  if (event.isComposing || event.defaultPrevented) return null;
  if (event.altKey || event.metaKey) return null;

  if (event.ctrlKey) {
    // Let the paste handler own Ctrl/Cmd+V (text + images for OpenCode).
    if (event.key === "v" || event.key === "V") return null;
    if (event.key.length === 1) {
      const code = event.key.toUpperCase().charCodeAt(0) - 64;
      if (code >= 1 && code <= 26) return String.fromCharCode(code);
    }
    return null;
  }

  switch (event.key) {
    case "Enter":
      return "\r";
    case "Backspace":
      return "\x7f";
    case "Tab":
      return "\t";
    case "Escape":
      return "\x1b";
    case "ArrowUp":
      return "\x1b[A";
    case "ArrowDown":
      return "\x1b[B";
    case "ArrowRight":
      return "\x1b[C";
    case "ArrowLeft":
      return "\x1b[D";
    case "Home":
      return "\x1b[H";
    case "End":
      return "\x1b[F";
    case "Delete":
      return "\x1b[3~";
    case "PageUp":
      return "\x1b[5~";
    case "PageDown":
      return "\x1b[6~";
    default:
      if (event.key.length === 1) return event.key;
      return null;
  }
}

type CellMetrics = { width: number; height: number };

function readCellMetrics(terminal: XTerm): CellMetrics | null {
  const core = (
    terminal as unknown as {
      _core?: { _renderService?: { dimensions?: { css?: { cell?: CellMetrics } } } };
    }
  )._core;
  const cell = core?._renderService?.dimensions?.css?.cell;
  if (!cell?.width || !cell?.height) return null;
  return cell;
}

/** Fit cols/rows to the host without FitAddon’s scrollbar gutter (breaks OpenCode). */
function fitHostToPty(
  host: HTMLElement,
  terminal: XTerm,
  fitAddon: FitAddon,
): { cols: number; rows: number } | null {
  if (host.clientWidth < 8 || host.clientHeight < 8) return null;

  let cell = readCellMetrics(terminal);
  if (!cell) {
    // Measure cell size with scrollback briefly disabled so FitAddon doesn’t reserve 14px.
    const prevScrollback = terminal.options.scrollback;
    terminal.options.scrollback = 0;
    try {
      fitAddon.fit();
    } catch {
      // ignore
    }
    terminal.options.scrollback = prevScrollback;
    cell = readCellMetrics(terminal);
  }
  if (!cell) {
    return { cols: terminal.cols, rows: terminal.rows };
  }

  const cols = Math.max(2, Math.floor(host.clientWidth / cell.width));
  const rows = Math.max(2, Math.floor(host.clientHeight / cell.height));
  if (cols !== terminal.cols || rows !== terminal.rows) {
    terminal.resize(cols, rows);
  }
  return { cols, rows };
}

export function TerminalPane({
  isActive,
  session,
  paneId,
  chrome = "full",
  onClose,
  onRestart,
  onFocus,
}: {
  isActive: boolean;
  session: TerminalSession;
  paneId: string;
  /** full = header+body; body = xterm only (parent owns tab bar). */
  chrome?: "full" | "body";
  onClose: () => void;
  onRestart: () => void;
  onFocus: () => void;
}) {
  const { setError, t, theme, activeWorkspace } = useSpace();
  const [dropping, setDropping] = useState(false);
  const [xtermReady, setXtermReady] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeFnRef = useRef<(() => void) | null>(null);
  const sessionIdRef = useRef(session.id);
  const writeFailNotified = useRef(false);
  const writeBufRef = useRef("");
  const writeFlushTimerRef = useRef(0);
  const pendingOutputRef = useRef("");
  sessionIdRef.current = session.id;

  const flushPtyWrites = () => {
    if (writeFlushTimerRef.current) {
      window.clearTimeout(writeFlushTimerRef.current);
      writeFlushTimerRef.current = 0;
    }
    const chunk = writeBufRef.current;
    writeBufRef.current = "";
    if (!chunk) return;
    void writeTerminalSession(sessionIdRef.current, chunk).catch((err) => {
      if (!writeFailNotified.current) {
        writeFailNotified.current = true;
        setError(clientError(err) || t("term.writeError"));
      }
    });
  };

  /** Coalesce bursty TUI mouse/key reports (OpenCode scroll) into fewer IPC writes. */
  const sendToPty = (data: string) => {
    if (!data) return;
    writeBufRef.current += data;
    if (writeFlushTimerRef.current) return;
    writeFlushTimerRef.current = window.setTimeout(() => {
      writeFlushTimerRef.current = 0;
      flushPtyWrites();
    }, 8);
  };

  const insertIntoPty = (data: string) => {
    if (!data || session.status !== "online") return;
    onFocus();
    terminalRef.current?.focus();
    sendToPty(data);
  };

  useEffect(() => {
    writeFailNotified.current = false;
  }, [session.id]);

  // OS Explorer → absolute paths via Tauri drag-drop (HTML5 only gets basenames).
  useEffect(() => {
    const el = shellRef.current;
    if (!el || session.status !== "online") return;
    const dropId = `${paneId}:${session.id}`;
    return registerTerminalOsDropTarget({
      id: dropId,
      el,
      setHighlight: setDropping,
      onPaths: (paths) => {
        const payload = formatPathsForPty(paths);
        if (!payload) return;
        onFocus();
        terminalRef.current?.focus();
        void writeTerminalSession(sessionIdRef.current, bracketedPaste(payload)).catch((err) => {
          if (!writeFailNotified.current) {
            writeFailNotified.current = true;
            setError(clientError(err) || t("term.writeError"));
          }
        });
      },
    });
  }, [paneId, session.id, session.status, onFocus, setError, t]);

  useEffect(() => {
    pendingOutputRef.current = "";
    setXtermReady(false);
    const delay = nextXtermMountDelay();
    if (delay <= 0) {
      setXtermReady(true);
      return;
    }
    const timer = window.setTimeout(() => setXtermReady(true), delay);
    return () => window.clearTimeout(timer);
  }, [session.id]);

  useEffect(() => {
    if (!xtermReady) return;
    const host = containerRef.current;
    if (!host) return;

    const { theme: xtermTheme, allowTransparency } = readXtermTheme(theme);
    const terminal = new XTerm({
      cursorBlink: true,
      // TUIs (OpenCode) break with convertEol — absolute cursor addressing gets double-advanced
      convertEol: false,
      disableStdin: false,
      allowTransparency,
      fontFamily: "Cascadia Code, Consolas, JetBrains Mono, monospace",
      fontSize: 13,
      lineHeight: 1,
      letterSpacing: 0,
      scrollback: 4000,
      scrollOnUserInput: true,
      scrollSensitivity: 1,
      theme: xtermTheme,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host);

    if (pendingOutputRef.current) {
      const buffered = pendingOutputRef.current;
      pendingOutputRef.current = "";
      terminal.write(buffered);
    }

    const dataDisposable = terminal.onData((data) => sendToPty(data));

    // Prefer focusing so wheel / mouse mode reach the PTY, not parent panes.
    const onWheel = () => {
      if (document.activeElement !== terminal.textarea) {
        terminal.focus();
      }
    };
    host.addEventListener("wheel", onWheel, { passive: true });

    let lastCols = 0;
    let lastRows = 0;
    const resize = () => {
      try {
        const size = fitHostToPty(host, terminal, fitAddon);
        if (!size) return;
        if (size.cols === lastCols && size.rows === lastRows) return;
        lastCols = size.cols;
        lastRows = size.rows;
        void resizeTerminalSession(sessionIdRef.current, size.cols, size.rows);
      } catch {
        // ignore
      }
    };
    resizeFnRef.current = resize;

    let resizeRaf = 0;
    const scheduleResize = () => {
      if (resizeRaf) return;
      resizeRaf = window.requestAnimationFrame(() => {
        resizeRaf = 0;
        resize();
      });
    };

    const observer = new ResizeObserver(() => scheduleResize());
    observer.observe(host);
    const t1 = window.setTimeout(() => {
      resize();
      if (isActive) terminal.focus();
    }, 60);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    return () => {
      window.clearTimeout(t1);
      if (resizeRaf) window.cancelAnimationFrame(resizeRaf);
      observer.disconnect();
      host.removeEventListener("wheel", onWheel);
      dataDisposable.dispose();
      resizeFnRef.current = null;
      flushPtyWrites();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, xtermReady]);

  useLayoutEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const { theme: xtermTheme, allowTransparency } = readXtermTheme(theme);
    terminal.options.allowTransparency = allowTransparency;
    terminal.options.theme = xtermTheme;
    const bg = String(xtermTheme.background || "#000000");
    const fg = String(xtermTheme.foreground || "#f0f0f0");
    // Sync default PTY colors for shells that honor OSC 10/11 (hex only).
    if (bg.startsWith("#") && (bg.length === 7 || bg.length === 9)) {
      terminal.write(`\x1b]11;${bg.slice(0, 7)}\x07`);
      terminal.write(`\x1b]10;${fg.startsWith("#") ? fg.slice(0, 7) : fg}\x07`);
    }
    try {
      terminal.refresh(0, Math.max(0, terminal.rows - 1));
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    if (!isActive) return;
    const focus = () => {
      try {
        resizeFnRef.current?.();
        terminalRef.current?.focus();
      } catch {
        // ignore
      }
    };
    focus();
    const id = window.setTimeout(focus, 50);
    const id2 = window.setTimeout(focus, 200);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(id2);
    };
  }, [isActive]);

  useEffect(() => {
    if (!isActive || session.status !== "online") return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) &&
          !target.classList.contains("xterm-helper-textarea")
        ) {
          return;
        }
      }
      const ta = terminalRef.current?.textarea;
      if (ta && document.activeElement === ta) return;

      const payload = keyEventToPty(event);
      if (payload == null) return;
      event.preventDefault();
      event.stopPropagation();
      sendToPty(payload);
    };

    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) &&
        !target.classList.contains("xterm-helper-textarea")
      ) {
        return;
      }
      // Snapshot + preventDefault must stay synchronous (clipboardData expires).
      const snap = snapshotClipboard(event);
      event.preventDefault();
      event.stopPropagation();
      void payloadFromClipboardSnapshot(snap)
        .then((payload) => {
          if (!payload) return;
          insertIntoPty(bracketedPaste(payload));
        })
        .catch((err) => {
          if (!writeFailNotified.current) {
            writeFailNotified.current = true;
            setError(clientError(err) || t("term.writeError"));
          }
        });
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("paste", onPaste, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("paste", onPaste, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, session.status]);

  useEffect(() => {
    const unlistenOutput = listen<TerminalOutputEvent>("terminal://output", (event) => {
      if (event.payload.id !== session.id) return;
      const term = terminalRef.current;
      if (term) {
        term.write(event.payload.data);
        return;
      }
      pendingOutputRef.current += event.payload.data;
      if (pendingOutputRef.current.length > 180_000) {
        pendingOutputRef.current = pendingOutputRef.current.slice(-90_000);
      }
    });
    const unlistenExit = listen<TerminalExitEvent>("terminal://exit", (event) => {
      if (event.payload.id !== session.id) return;
      const message = `\r\n[${event.payload.message}]`;
      const term = terminalRef.current;
      if (term) term.writeln(message);
      else pendingOutputRef.current += message;
    });
    return () => {
      void unlistenOutput.then((u) => u());
      void unlistenExit.then((u) => u());
    };
  }, [session.id]);

  const isOffline = session.status !== "online";

  return (
    <div
      ref={shellRef}
      data-term-drop={`${paneId}:${session.id}`}
      className={`vs-terminalShell${isActive ? " is-active" : ""}${dropping ? " is-dropFile" : ""}`}
      data-drop-label={t("term.dropHint")}
      onMouseDown={() => {
        onFocus();
        terminalRef.current?.focus();
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        setDropping(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDropping(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDropping(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDropping(false);
        const cwd = session.cwd || activeWorkspace?.cwd || null;
        const payload = payloadFromDataTransfer(event.dataTransfer, { cwd });
        if (payload) {
          insertIntoPty(bracketedPaste(payload));
          return;
        }
        const files = event.dataTransfer.files;
        if (files?.length) {
          void payloadFromFileList(files)
            .then((fromFiles) => {
              if (fromFiles) insertIntoPty(bracketedPaste(fromFiles));
            })
            .catch((err) => {
              if (!writeFailNotified.current) {
                writeFailNotified.current = true;
                setError(clientError(err) || t("term.writeError"));
              }
            });
        }
      }}
    >
      {chrome === "full" ? (
        <div className="vs-terminalHeader">
          <span
            className="vs-dragHandle"
            data-pane-drag={paneId}
            title={t("term.drag")}
            aria-hidden
          >
            <IconGrip size={14} />
          </span>
          <strong>{session.title}</strong>
          <small>
            {session.shell.replace(/^.*[\\/]/, "").replace(/\.exe$/i, "") || session.shell}
          </small>
          {session.needsAttention ? (
            <span className="vs-attnDot" data-no-drag title={t("term.attention")} aria-label={t("term.attention")} />
          ) : null}
          <span className="vs-spacer" />
          <button
            type="button"
            className="vs-termIconBtn"
            data-no-drag
            title={t("term.restart")}
            aria-label={t("term.restart")}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRestart();
            }}
          >
            <IconRefresh size={14} />
          </button>
          <button
            type="button"
            className="vs-termIconBtn is-danger"
            data-no-drag
            title={t("term.close")}
            aria-label={t("term.close")}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            <IconX size={14} />
          </button>
        </div>
      ) : null}
      <div className="vs-xtermHost" ref={containerRef} />
      {isOffline && (
        <div className={`vs-terminalOverlay is-${session.status}`}>
          <strong>{session.status === "error" ? t("term.error") : t("term.closed")}</strong>
          <span>{t("term.restartHint")}</span>
        </div>
      )}
    </div>
  );
}
