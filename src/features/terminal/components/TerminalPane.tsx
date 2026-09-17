import { useEffect, useRef, useState } from "react";
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
  payloadFromDataTransfer,
  rawPathsFromDataTransfer,
  registerTerminalOsDropTarget,
} from "../drop";
import {
  bracketedPaste,
  formatAgentAttachment,
  payloadFromClipboardSnapshot,
  payloadFromFileList,
  snapshotClipboard,
  wrapAgentPaste,
} from "../paste";
import { nextXtermMountDelay } from "../spawnQueue";
import type { TerminalExitEvent, TerminalOutputEvent } from "../types";
import { subscribeTheme } from "@/features/theme";
import { xtermThemeForId } from "../xtermTheme";
import { subscribeZoom } from "@/features/ui/zoom";
import { isAgentDrag } from "@/features/agents/drag";
import { agentIdForSession } from "@/features/agents/sessionAgent";
import { isAgentChatDropRelease } from "@/features/agents/agentChatDrop";
import {
  clearFileDropPaint,
  emitPaneDrag,
  isExternalFileDrag,
  resetDragUi,
} from "@/features/workspace/paneDropOverlay";
import {
  previewPathsFromDataTransfer,
  resolvePreviewPathsFromDrop,
} from "@/features/workspace/workspaceFileDrop";

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
  const { setError, t, activeWorkspace, takePendingSessionPaste, handleFileDropAt, agentRuns } =
    useSpace();
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

  const insertIntoPty = (data: string, opts?: { focus?: boolean }) => {
    if (!data || session.status !== "online") return;
    if (opts?.focus !== false) {
      onFocus();
      terminalRef.current?.focus();
    }
    sendToPty(data);
  };

  const agentId = agentIdForSession(session, agentRuns);
  const isAgentSession = agentId !== "shell";

  const pasteInto = (payload: string) => {
    insertIntoPty(isAgentSession ? wrapAgentPaste(agentId, payload) : bracketedPaste(payload));
  };

  useEffect(() => {
    if (!isAgentSession || session.status !== "online") return;
    const shell = shellRef.current;
    if (!shell) return;
    const id = `${paneId}:${session.id}`;
    return registerTerminalOsDropTarget({
      id,
      el: shell,
      setHighlight: (on) => {
        if (isAgentSession) {
          if (on) shell.classList.add("is-dropChat");
          else shell.classList.remove("is-dropChat");
        } else {
          setDropping(on);
        }
      },
      onPaths: (paths) => {
        const attachment = formatAgentAttachment(agentId, paths);
        if (attachment) pasteInto(attachment);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAgentSession, session.id, session.status, agentId, paneId]);

  useEffect(() => {
    writeFailNotified.current = false;
  }, [session.id]);

  useEffect(() => {
    if (session.status !== "online") return;
    const pending = takePendingSessionPaste(session.id);
    if (!pending) return;
    onFocus();
    terminalRef.current?.focus();
    void writeTerminalSession(sessionIdRef.current, pending).catch((err) => {
      if (!writeFailNotified.current) {
        writeFailNotified.current = true;
        setError(clientError(err) || t("term.writeError"));
      }
    });
  }, [session.id, session.status, onFocus, setError, t, takePendingSessionPaste]);

  useEffect(() => {
    pendingOutputRef.current = "";
    setXtermReady(false);
    const delay = isActive ? 0 : nextXtermMountDelay();
    if (delay <= 0) {
      setXtermReady(true);
      return;
    }
    const timer = window.setTimeout(() => setXtermReady(true), delay);
    return () => window.clearTimeout(timer);
  }, [session.id, isActive]);

  useEffect(() => {
    if (!xtermReady) return;
    const host = containerRef.current;
    if (!host) return;

    const mono =
      getComputedStyle(document.documentElement).getPropertyValue("--vs-mono").trim() ||
      '"JetBrains Mono", "Cascadia Code", ui-monospace, Menlo, monospace';
    const { theme: xtermTheme, allowTransparency } = xtermThemeForId();
    const terminal = new XTerm({
      cursorBlink: true,
      // TUIs (OpenCode) break with convertEol — absolute cursor addressing gets double-advanced
      convertEol: false,
      disableStdin: false,
      allowTransparency,
      fontFamily: mono,
      fontSize: 13,
      lineHeight: 1.18,
      letterSpacing: 0,
      scrollback: 8000,
      scrollOnUserInput: true,
      scrollSensitivity: 1,
      theme: xtermTheme,
      windowsPty: { backend: "conpty" },
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

    // Scroll scrollback without stealing focus from another pane; click to type.
    const onWheel = (event: WheelEvent) => {
      if (document.body.classList.contains("is-agent-dragging")) {
        resetDragUi();
      }
      const focused = document.activeElement === terminal.textarea;
      if (!focused && event.deltaY !== 0) {
        event.preventDefault();
        event.stopPropagation();
        const lines = Math.max(1, Math.round(Math.abs(event.deltaY) / 40));
        terminal.scrollLines(event.deltaY > 0 ? lines : -lines);
      }
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    const onHostPointerDown = () => {
      if (document.body.classList.contains("is-agent-dragging")) {
        resetDragUi();
      }
      terminal.focus();
    };
    host.addEventListener("pointerdown", onHostPointerDown);

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

    const syncTheme = () => {
      const next = xtermThemeForId();
      terminal.options.theme = next.theme;
      terminal.options.allowTransparency = next.allowTransparency;
      try {
        if (terminal.rows > 0) terminal.refresh(0, terminal.rows - 1);
      } catch {
        // ignore
      }
    };
    const unsubTheme = subscribeTheme(syncTheme);

    return () => {
      unsubTheme();
      window.clearTimeout(t1);
      if (resizeRaf) window.cancelAnimationFrame(resizeRaf);
      observer.disconnect();
      host.removeEventListener("wheel", onWheel);
      host.removeEventListener("pointerdown", onHostPointerDown);
      dataDisposable.dispose();
      resizeFnRef.current = null;
      flushPtyWrites();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, xtermReady]);

  useEffect(() => {
    return subscribeZoom(() => {
      const terminal = terminalRef.current;
      const fitAddon = fitAddonRef.current;
      const host = containerRef.current;
      if (!terminal || !fitAddon || !host) return;
      const prev = terminal.options.scrollback;
      terminal.options.scrollback = 0;
      try {
        fitAddon.fit();
      } catch {
        // ignore
      }
      terminal.options.scrollback = prev;
      resizeFnRef.current?.();
      try {
        terminal.refresh(0, Math.max(0, terminal.rows - 1));
      } catch {
        // ignore
      }
    });
  }, []);

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
      void payloadFromClipboardSnapshot(snap, { agentId: isAgentSession ? agentId : undefined })
        .then((payload) => {
          if (!payload) return;
          pasteInto(payload);
        })
        .catch(() => undefined);
    };

    const onKeyPaste = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key !== "v" && event.key !== "V") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) &&
        !target.classList.contains("xterm-helper-textarea")
      ) {
        return;
      }
      // Let the paste event own the payload when the browser fires it.
      // If focus is on the pane but not textarea, still allow default paste → onPaste.
      if (document.activeElement === terminalRef.current?.textarea) return;
      try {
        terminalRef.current?.focus();
      } catch {
        // ignore
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keydown", onKeyPaste, true);
    window.addEventListener("paste", onPaste, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keydown", onKeyPaste, true);
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
  const showBootOverlay = isOffline || !xtermReady;

  return (
    <div
      ref={shellRef}
      data-term-drop={`${paneId}:${session.id}`}
      className={`vs-terminalShell${isActive ? " is-active" : ""}${isAgentSession ? " is-agentChat" : ""}${!isAgentSession && dropping ? " is-dropFile" : ""}`}
      data-drop-label={t("term.dropHint")}
      onMouseDown={() => {
        onFocus();
        terminalRef.current?.focus();
      }}
      onDragEnter={(event) => {
        if (isAgentDrag(event.dataTransfer)) {
          event.preventDefault();
          return;
        }
        if (isAgentSession && isExternalFileDrag(event.dataTransfer.types)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          return;
        }
        event.preventDefault();
        setDropping(true);
      }}
      onDragOver={(event) => {
        if (isAgentDrag(event.dataTransfer)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          return;
        }
        if (isAgentSession && isExternalFileDrag(event.dataTransfer.types)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDropping(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDropping(false);
      }}
      onDrop={(event) => {
        if (isAgentDrag(event.dataTransfer)) {
          return;
        }
        const cwd = session.cwd || activeWorkspace?.cwd || null;
        const files = event.dataTransfer.files;

        if (isAgentSession && isExternalFileDrag(event.dataTransfer.types)) {
          event.preventDefault();
          event.stopPropagation();
          setDropping(false);
          clearFileDropPaint();
          emitPaneDrag(false, "file");
          const inChat = isAgentChatDropRelease(shellRef.current, event.clientY);

          if (inChat) {
            void (async () => {
              if (files?.length) {
                const fromFiles = await payloadFromFileList(files, { agentId });
                if (fromFiles) {
                  pasteInto(fromFiles);
                  return;
                }
              }
              const paths = await resolvePreviewPathsFromDrop(event.dataTransfer, { cwd });
              if (paths.length) {
                const attachment = formatAgentAttachment(agentId, paths);
                if (attachment) pasteInto(attachment);
                return;
              }
              const diskPaths = rawPathsFromDataTransfer(event.dataTransfer, { cwd });
              if (diskPaths.length) {
                const attachment = formatAgentAttachment(agentId, diskPaths);
                if (attachment) pasteInto(attachment);
                return;
              }
              const payload = payloadFromDataTransfer(event.dataTransfer, { cwd });
              if (payload) pasteInto(payload);
            })().catch(() => undefined);
            return;
          }

          void (async () => {
            const paths = await resolvePreviewPathsFromDrop(event.dataTransfer, { cwd });
            if (paths[0]) {
              await handleFileDropAt(paneId, "center", "", {
                shiftKey: event.shiftKey,
                rawPaths: paths,
              });
            }
          })().catch(() => undefined);
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        setDropping(false);
        clearFileDropPaint();
        emitPaneDrag(false, "file");

        const previewPaths = previewPathsFromDataTransfer(event.dataTransfer, { cwd });
        if (previewPaths[0]) {
          void handleFileDropAt(paneId, "center", "", {
            shiftKey: event.shiftKey,
            rawPaths: previewPaths,
          });
          return;
        }
        const payload = payloadFromDataTransfer(event.dataTransfer, { cwd });
        if (payload) {
          pasteInto(payload);
          return;
        }
        if (files?.length) {
          void payloadFromFileList(files)
            .then((fromFiles) => {
              if (fromFiles) pasteInto(fromFiles);
            })
            .catch(() => undefined);
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
      {showBootOverlay ? (
        <div className={`vs-terminalOverlay is-${session.status}${!xtermReady ? " is-mounting" : ""}`}>
          {session.status === "error" ? (
            <>
              <strong>{t("term.error")}</strong>
              <span>{t("term.restartHint")}</span>
            </>
          ) : session.status === "closed" ? (
            <>
              <strong>{t("term.closed")}</strong>
              <span>{t("term.restartHint")}</span>
            </>
          ) : (
            <>
              <div className="vs-paneLoader" aria-hidden>
                <span />
                <span />
                <span />
              </div>
              <strong>{t("term.starting")}</strong>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
