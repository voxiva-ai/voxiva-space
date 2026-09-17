import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  browserClose,
  browserConfigureInspector,
  browserHide,
  browserOpen,
  browserOpenDevtools,
  browserPageMeta,
  browserReload,
  browserSetBounds,
  browserTakeInspectorEvent,
  browserToggleInspector,
  findComponentFiles,
  writeAnnotateContext,
  type BrowserSelection,
} from "@/features/browser/api";
import {
  IconCodeBrowser,
  IconExternalLink,
  IconInspect,
  IconRefresh,
  IconSearch,
} from "@/components/icons";
import { agentBots, isBotReady, resolveBotCommand } from "@/features/agents/bots";
import { useSpace } from "@/features/workspace/SpaceContext";
import { clientError } from "@/lib/errors";
import { openUrl, writeTerminalSession, isVsCodeServeWebUrl } from "@/features/terminal/api";
import {
  localhostAlt,
  normalizeBrowserUrl,
  rememberBrowserUrl,
  resolveOmniboxInput,
  getOmniboxSuggestions,
} from "./url";

export type BrowserTabMeta = {
  title: string;
  favicon: string;
};

type NativeBrowserProps = {
  url: string;
  onUrlChange: (url: string) => void;
  /** Page title / favicon after load — for the pane tab label. */
  onMetaChange?: (meta: BrowserTabMeta) => void;
  compact?: boolean;
  /** When false, keep instance alive but hide the native webview (tab switch). */
  active?: boolean;
  dragPaneId?: string;
  onClose?: () => void;
  instanceId?: string;
  /** Extra chrome actions (unused in compact cmux chrome; kept for callers). */
  actions?: ReactNode;
};

type Bounds = { x: number; y: number; width: number; height: number };

function sameBounds(a: Bounds | null, b: Bounds) {
  return Boolean(
    a &&
      Math.abs(a.x - b.x) < 1 &&
      Math.abs(a.y - b.y) < 1 &&
      Math.abs(a.width - b.width) < 1 &&
      Math.abs(a.height - b.height) < 1,
  );
}

export function NativeBrowser({
  url,
  onUrlChange,
  onMetaChange,
  compact = false,
  active = true,
  dragPaneId,
  instanceId,
}: NativeBrowserProps) {
  const reactId = useId().replace(/:/g, "");
  const label = `browser-${instanceId ?? dragPaneId ?? reactId}`;
  const {
    activeWorkspace,
    agentAvailability,
    agentsScanned,
    launchAgent,
    setError,
    t,
  } = useSpace();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hostEl, setHostEl] = useState<HTMLDivElement | null>(null);
  const aliveRef = useRef(true);
  const openedRef = useRef(false);
  const suppressedRef = useRef(false);
  const lastBounds = useRef<Bounds | null>(null);
  const rafRef = useRef(0);
  const inspectorRef = useRef(false);
  const inspectorBusyRef = useRef(false);
  /** Last URL we intentionally applied — blocks parent↔child navigation loops. */
  const appliedUrlRef = useRef("");
  const navGenRef = useRef(0);
  const sendActionRef = useRef<
    (
      picked: BrowserSelection,
      instruction: string,
      agentId: string,
    ) => Promise<void>
  >(async () => undefined);
  const [draft, setDraft] = useState(url || "");
  const [loadedUrl, setLoadedUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [localError, setLocalError] = useState("");
  const [omniboxOpen, setOmniboxOpen] = useState(false);
  const [omniboxIndex, setOmniboxIndex] = useState(0);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const bindHost = useCallback((node: HTMLDivElement | null) => {
    hostRef.current = node;
    setHostEl(node);
  }, []);
  const [inspector, setInspector] = useState(false);
  const [componentFiles, setComponentFiles] = useState<string[]>([]);
  const suggestions = useMemo(
    () => getOmniboxSuggestions(draft, activeWorkspace?.cwd),
    [draft, activeWorkspace?.cwd],
  );

  useEffect(() => {
    const onFocusOmnibar = () => {
      const input = urlInputRef.current;
      if (!input) return;
      input.focus();
      input.select();
      setOmniboxOpen(true);
    };
    window.addEventListener("voxiva-focus-omnibar", onFocusOmnibar);
    return () => window.removeEventListener("voxiva-focus-omnibar", onFocusOmnibar);
  }, []);

  const availableAgents = useMemo(
    () =>
      agentBots.filter((bot) => {
        if (!bot.command) return true; // Shell always available
        return !agentsScanned || isBotReady(bot, agentAvailability, true);
      }),
    [agentAvailability, agentsScanned],
  );
  // Brush picker lists every agent — launch still works via “try anyway”.
  const inspectorAgents = useMemo(
    () => agentBots.map(({ id, name }) => ({ id, name })),
    [],
  );

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      window.setTimeout(() => {
        if (aliveRef.current) return;
        openedRef.current = false;
        void browserClose(label).catch(() => undefined);
      }, 0);
    };
  }, [label]);

  useEffect(() => {
    setDraft(url || "");
  }, [url]);

  const readBounds = useCallback((): Bounds | null => {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect || rect.width < 8 || rect.height < 8) return null;
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }, []);

  const syncBounds = useCallback(async () => {
    if (!openedRef.current || suppressedRef.current || !aliveRef.current) return;
    const next = readBounds();
    if (!next || sameBounds(lastBounds.current, next)) return;
    lastBounds.current = next;
    await browserSetBounds({ label, ...next }).catch(() => undefined);
  }, [label, readBounds]);

  const scheduleBounds = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      void syncBounds();
    });
  }, [syncBounds]);

  const openAt = useCallback(
    async (next: string, navigate = true) => {
      let bounds = readBounds();
      for (let attempt = 0; attempt < 16 && !bounds; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 16));
        if (!aliveRef.current) return;
        bounds = readBounds();
      }
      if (!bounds || !aliveRef.current) throw new Error("Browser area is not ready");
      lastBounds.current = bounds;
      setBusy(true);
      setLocalError("");
      await browserOpen({ label, url: next, ...bounds, navigate });
      if (!aliveRef.current) {
        await browserClose(label).catch(() => undefined);
        return;
      }
      openedRef.current = true;
      setLoadedUrl(next);
      setLive(true);
      // Re-apply bounds after paint — child HWND can land at 0×0 on first create.
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));
      lastBounds.current = null;
      await syncBounds();
      window.setTimeout(() => {
        if (aliveRef.current) {
          lastBounds.current = null;
          void syncBounds();
          setBusy(false);
        }
      }, 120);
    },
    [label, readBounds, syncBounds],
  );

  const clearBrowser = useCallback(async () => {
    navGenRef.current += 1;
    appliedUrlRef.current = "";
    setDraft("");
    setLoadedUrl("");
    setLocalError("");
    onUrlChange("");
    setLive(false);
    setBusy(false);
    setInspector(false);
    inspectorRef.current = false;
    setComponentFiles([]);
    if (openedRef.current) {
      openedRef.current = false;
      await browserClose(label).catch(() => undefined);
    }
  }, [label, onUrlChange]);

  const go = useCallback(
    async (raw?: string) => {
      const source = raw ?? draft;
      if (!source.trim()) {
        await clearBrowser();
        return;
      }
      let next = resolveOmniboxInput(source);
      if (!next) {
        await clearBrowser();
        return;
      }
      const gen = ++navGenRef.current;
      appliedUrlRef.current = next;
      setDraft(next);
      setLoadedUrl(next);
      setLocalError("");
      setOmniboxOpen(false);
      onUrlChange(next);
      rememberBrowserUrl(next);
      try {
        await openAt(next, true);
        if (gen !== navGenRef.current) return;
      } catch (error) {
        if (!aliveRef.current || gen !== navGenRef.current) return;
        const alt = localhostAlt(next);
        if (alt && alt !== next) {
          try {
            appliedUrlRef.current = alt;
            setDraft(alt);
            setLoadedUrl(alt);
            onUrlChange(alt);
            rememberBrowserUrl(alt);
            await openAt(alt, true);
            if (gen !== navGenRef.current) return;
            return;
          } catch {
            // fall through
          }
        }
        setBusy(false);
        setLive(false);
        const msg = clientError(error);
        setLocalError(msg || t("browser.waiting"));
        setError(msg);
      }
    },
    [clearBrowser, draft, onUrlChange, openAt, setError, t],
  );

  // Parent-driven URL (suggest toast / setPaneBrowserUrl) — never re-enter our own writes.
  useEffect(() => {
    const next = normalizeBrowserUrl(url || "");
    if (next === appliedUrlRef.current) return;
    if (!next) {
      if (appliedUrlRef.current || openedRef.current) void clearBrowser();
      return;
    }
    void go(next);
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hostEl) return;
    const observer = new ResizeObserver(scheduleBounds);
    observer.observe(hostEl);
    window.addEventListener("resize", scheduleBounds);
    window.visualViewport?.addEventListener("resize", scheduleBounds);
    scheduleBounds();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleBounds);
      window.visualViewport?.removeEventListener("resize", scheduleBounds);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [hostEl, scheduleBounds]);

  useEffect(() => {
    const onDrag = (event: Event) => {
      const dragging = Boolean((event as CustomEvent<{ active?: boolean }>).detail?.active);
      suppressedRef.current = dragging || !active;
      if (!openedRef.current) return;
      if (dragging || !active) {
        void browserHide(label).catch(() => undefined);
        setLive(false);
        return;
      }
      const next = loadedUrl || normalizeBrowserUrl(draft);
      if (!next) return;
      lastBounds.current = null;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void openAt(next, false)
            .then(() => syncBounds())
            .catch(() => undefined);
        });
      });
    };
    window.addEventListener("voxiva-pane-drag", onDrag);
    return () => window.removeEventListener("voxiva-pane-drag", onDrag);
  }, [active, draft, label, loadedUrl, openAt, syncBounds]);

  // Tab switch: hide native surface when this browser tab is not selected.
  useEffect(() => {
    if (!openedRef.current) return;
    if (!active) {
      suppressedRef.current = true;
      void browserHide(label).catch(() => undefined);
      setLive(false);
      return;
    }
    suppressedRef.current = false;
    const next = loadedUrl || normalizeBrowserUrl(draft);
    if (!next) return;
    lastBounds.current = null;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void openAt(next, false)
          .then(() => syncBounds())
          .catch(() => undefined);
      });
    });
  }, [active, draft, label, loadedUrl, openAt, syncBounds]);

  useEffect(() => {
    const unlisten = listen<{ label: string; url: string }>(
      "browser://new-window",
      ({ payload }) => {
        if (payload.label === label && aliveRef.current) void go(payload.url);
      },
    );
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [go, label]);

  useEffect(() => {
    const unlisten = listen<{ label: string; url: string; state: "started" | "finished" }>(
      "browser://load",
      ({ payload }) => {
        if (payload.label !== label || !aliveRef.current) return;
        if (payload.state === "started") {
          setBusy(true);
          return;
        }
        setBusy(false);
        setLive(true);
        if (/^https?:\/\//i.test(payload.url)) {
          setDraft(payload.url);
          setLoadedUrl(payload.url);
          onUrlChange(payload.url);
        }
        const vscodePage = isVsCodeServeWebUrl(payload.url);
        if (vscodePage) {
          inspectorRef.current = false;
          setInspector(false);
        } else if (inspectorRef.current) {
          void browserToggleInspector(label, true).catch(() => undefined);
          void browserConfigureInspector(label, inspectorAgents, componentFiles).catch(
            () => undefined,
          );
        }
        // Refresh tab title / favicon from the live page.
        window.setTimeout(() => {
          if (!aliveRef.current) return;
          void browserPageMeta(label)
            .then((meta) => {
              if (!aliveRef.current) return;
              onMetaChange?.({
                title: meta.title || "",
                favicon: meta.favicon || "",
              });
            })
            .catch(() => undefined);
        }, 120);
      },
    );
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [componentFiles, inspectorAgents, label, onMetaChange, onUrlChange]);

  useEffect(() => {
    if (!loadedUrl || !active || !inspector) return;
    let stopped = false;
    let inFlight = false;
    const filesRef = { current: componentFiles };
    filesRef.current = componentFiles;
    const poll = async () => {
      if (inFlight || !openedRef.current || document.hidden) return;
      inFlight = true;
      try {
        const event = await browserTakeInspectorEvent(label);
        if (!event) return;
        // In-page "press active mode again" turns brush off — mirror toolbar state.
        if (event.disabled) {
          inspectorRef.current = false;
          setInspector(false);
        }
        if (event.action) {
          void sendActionRef.current(
            event.action.selection,
            event.action.instruction,
            event.action.agentId,
          ).catch((error) => setError(clientError(error)));
        }
        if (stopped) return;
        if (event.selection) {
          const picked = event.selection;
          lastBounds.current = null;
          requestAnimationFrame(() => requestAnimationFrame(scheduleBounds));
          if (activeWorkspace?.cwd) {
            void findComponentFiles(activeWorkspace.cwd, picked)
              .then((files) => {
                if (stopped) return;
                setComponentFiles(files);
                return browserConfigureInspector(label, inspectorAgents, files);
              })
              .catch(() => undefined);
          } else {
            void browserConfigureInspector(label, inspectorAgents, []).catch(() => undefined);
          }
        }
      } catch (error) {
        const message = clientError(error);
        if (message && !/timed out|reject/i.test(message)) {
          setError(message);
        }
      } finally {
        inFlight = false;
      }
    };
    void browserConfigureInspector(label, inspectorAgents, filesRef.current).catch(() => undefined);
    void poll();
    const timer = window.setInterval(() => void poll(), 120);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, activeWorkspace?.cwd, inspector, inspectorAgents, label, loadedUrl, scheduleBounds]);

  function reload() {
    if (!openedRef.current) return;
    setBusy(true);
    void browserReload(label).catch((error) => {
      setBusy(false);
      setError(clientError(error));
    });
  }

  useEffect(() => {
    const onPreviewReload = () => {
      const current = loadedUrl || draft;
      if (!openedRef.current || !current) return;
      if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(current) && !/^file:/i.test(current)) {
        return;
      }
      reload();
    };
    const onPaneReload = (event: Event) => {
      const detail = (event as CustomEvent<{ paneId?: string }>).detail;
      const target = detail?.paneId;
      if (!target) return;
      if (target !== instanceId && target !== dragPaneId) return;
      if (!openedRef.current) return;
      reload();
    };
    window.addEventListener("voxiva-preview-reload", onPreviewReload);
    window.addEventListener("voxiva-browser-reload", onPaneReload);
    return () => {
      window.removeEventListener("voxiva-preview-reload", onPreviewReload);
      window.removeEventListener("voxiva-browser-reload", onPaneReload);
    };
  }, [draft, dragPaneId, instanceId, label, loadedUrl]);

  function openNativeDevtools() {
    if (!openedRef.current) {
      setError(t("browser.devtoolsNeedSite"));
      return;
    }
    void browserOpenDevtools(label).catch((error) => {
      setError(clientError(error) || t("browser.devtoolsFailed"));
    });
  }

  const isVsCode = isVsCodeServeWebUrl(loadedUrl);

  useEffect(() => {
    scheduleBounds();
  }, [inspector, scheduleBounds]);

  useEffect(() => {
    if (!isVsCode || !inspectorRef.current) return;
    inspectorRef.current = false;
    setInspector(false);
    void browserToggleInspector(label, false).catch(() => undefined);
  }, [isVsCode, label]);

  async function setInspectorEnabled(next: boolean) {
    if (!openedRef.current) {
      return false;
    }
    if (isVsCodeServeWebUrl(loadedUrl || draft)) return false;

    // Off must always win — never block disable behind an in-flight enable.
    if (!next) {
      inspectorBusyRef.current = false;
      inspectorRef.current = false;
      setInspector(false);
      void browserToggleInspector(label, false).catch(() => undefined);
      return true;
    }

    if (inspectorBusyRef.current) return inspectorRef.current;
    inspectorBusyRef.current = true;
    inspectorRef.current = true;
    setInspector(true);
    try {
      let ok = false;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        // User may have clicked off while we were retrying.
        if (!inspectorRef.current) return false;
        if (attempt === 0) {
          void browserConfigureInspector(label, inspectorAgents, componentFiles).catch(
            () => undefined,
          );
        }
        ok = await browserToggleInspector(label, true);
        if (ok) break;
        await new Promise((r) => window.setTimeout(r, 60 + attempt * 70));
      }
      if (!inspectorRef.current) return false;
      if (!ok) {
        inspectorRef.current = false;
        setInspector(false);
        // No scary toast — brush simply stays off; try again after navigation.
        return false;
      }
      return true;
    } catch {
      inspectorRef.current = false;
      setInspector(false);
      return false;
    } finally {
      inspectorBusyRef.current = false;
    }
  }

  function toggleInspector() {
    if (!loadedUrl || isVsCode || (inspectorBusyRef.current && !inspectorRef.current)) return;
    void setInspectorEnabled(!inspectorRef.current);
  }

  function openExternal() {
    const next = normalizeBrowserUrl(draft || loadedUrl);
    if (next) void openUrl(next).catch((error) => setError(clientError(error)));
  }

  async function sendSelectionToAgent(
    picked: BrowserSelection,
    instruction: string,
    agentId: string,
  ) {
    if (!instruction.trim()) return;

    const full = instruction.trim();

    // Brush Copy already hands us pretty JSON — paste as-is, no markdown rewrite.
    if (agentId === "clipboard") {
      try {
        await navigator.clipboard.writeText(full);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = full;
        ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try {
          document.execCommand("copy");
        } finally {
          ta.remove();
        }
      }
      return;
    }

    let detailsPath = "";
    try {
      detailsPath = await writeAnnotateContext(full);
    } catch {
      detailsPath = "";
    }

    const pageMatch = full.match(/^\*\*Page:\*\*\s*(.+)$/m) || full.match(/^Page:\s*(.+)$/m);
    const countMatch =
      full.match(/^\*\*Selections:\*\*\s*(\d+)/m) || full.match(/^Selections:\s*(\d+)/m);
    const headings = [
      ...full.matchAll(/^##\s+([A-Z])\.\s+(.+)$/gm),
      ...full.matchAll(/^##\s+\d+\.\s+(.+)$/gm),
    ].map((m) => (m[2] ? `${m[1]} ${m[2]}`.trim() : m[1].trim()));
    const docs = [...full.matchAll(/^-\s+`([^`]+)`$/gm)]
      .map((m) => m[1])
      .filter((path) => !path.includes(" ") || path.includes("/") || path.includes("\\"))
      .slice(0, 12);
    const noteLine =
      full
        .split("\n")
        .map((line) => line.trim())
        .find(
          (line) =>
            line &&
            !line.startsWith("#") &&
            !line.startsWith(">") &&
            !line.startsWith("**") &&
            !line.startsWith("Design-mode") &&
            !line.startsWith("{") &&
            !line.startsWith('"'),
        ) || "Update the selected UI elements.";
    const shortLines = [noteLine, ""];
    if (pageMatch) shortLines.push(`Page: ${pageMatch[1].trim()}`);
    if (countMatch || headings.length) {
      const count = countMatch?.[1] || String(headings.length);
      shortLines.push(
        headings.length ? `Selections: ${count} (${headings.join(", ")})` : `Selections: ${count}`,
      );
    }
    if (docs.length) {
      shortLines.push("Documents:");
      for (const doc of docs) shortLines.push(`- ${doc}`);
    }
    if (detailsPath) {
      shortLines.push(`Details: ${detailsPath}`, "");
      shortLines.push(
        "Open the Details file for selectors, styles, DOM snippets, and related documents, then apply the change in the codebase.",
      );
    } else {
      shortLines.push(full);
    }
    const short = shortLines.join("\n").trim();

    const compiled =
      /Design-mode annotation|## \d+\. |\nselector: |\nxpath: /.test(instruction) ||
      /\d+\. .+\n\s+page: |\n\s+selector: /.test(instruction);
    const preferredId = agentId === "shell" ? "opencode" : agentId;
    const bot =
      agentBots.find((item) => item.id === preferredId) ||
      availableAgents.find((item) => item.id === preferredId) ||
      agentBots.find((item) => item.id === "opencode") ||
      agentBots.find((item) => item.id === "shell");
    if (!bot) {
      setError(t("browser.devtoolsFailed"));
      return;
    }
    const sessionId = await launchAgent({
      title: bot.name,
      command: resolveBotCommand(bot, agentAvailability),
      accent: bot.accent,
    });
    if (!sessionId) {
      setError(t("agents.missingHint") || t("browser.devtoolsFailed"));
      return;
    }
    const files = componentFiles.length ? componentFiles.join(", ") : "not detected";
    const prompt = detailsPath
      ? short
      : compiled
        ? full
        : [
            full,
            "",
            `1. ${picked.component || picked.tag}`,
            `   page: ${picked.pageUrl}`,
            `   selector: ${picked.selector}`,
            picked.xpath ? `   xpath: ${picked.xpath}` : "",
            `   files: ${files}`,
            `   text: "${picked.text.replace(/\s+/g, " ").slice(0, 120) || "none"}"`,
          ]
            .filter(Boolean)
            .join("\n");
    const payload = `\x15\x1b[200~${prompt}\x1b[201~\r`;
    const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
    await wait(bot.command ? 1400 : 350);
    try {
      await writeTerminalSession(sessionId, payload);
    } catch {
      await wait(1600);
      try {
        await writeTerminalSession(sessionId, payload);
      } catch (error) {
        setError(clientError(error));
      }
    }
  }

  sendActionRef.current = sendSelectionToAgent;

  useEffect(() => {
    setOmniboxIndex(0);
  }, [draft, omniboxOpen]);

  const onOmniboxKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOmniboxOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOmniboxOpen(true);
      setOmniboxIndex((i) => Math.min(i + 1, Math.max(0, suggestions.length - 1)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOmniboxIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const pick = omniboxOpen ? suggestions[omniboxIndex] : null;
      void go(pick?.url ?? draft);
    }
  };

  const urlField = (compactField: boolean) => (
    <div className={`vs-browserUrlField${omniboxOpen && suggestions.length ? " is-suggesting" : ""}`}>
      {!compactField ? <IconSearch size={15} className="vs-browserSearchIcon" /> : null}
      <input
        ref={urlInputRef}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setOmniboxOpen(true);
        }}
        onFocus={() => setOmniboxOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOmniboxOpen(false), 120);
        }}
        onKeyDown={onOmniboxKeyDown}
        spellCheck={false}
        placeholder={t("browser.urlPlaceholder")}
        aria-label="URL"
        aria-autocomplete="list"
        aria-expanded={omniboxOpen && suggestions.length > 0}
      />
      {omniboxOpen && suggestions.length > 0 ? (
        <ul className="vs-omnibox" role="listbox">
          {suggestions.map((item, index) => (
            <li key={item.id} role="option" aria-selected={index === omniboxIndex}>
              <button
                type="button"
                className={`vs-omniboxItem${index === omniboxIndex ? " is-active" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  void go(item.url);
                }}
                onMouseEnter={() => setOmniboxIndex(index)}
              >
                <span className="vs-omniboxKind">
                  {item.kind === "search"
                    ? t("browser.suggestSearch")
                    : item.kind === "history"
                      ? t("browser.suggestHistory")
                      : item.kind === "preset"
                        ? t("browser.suggestPreset")
                        : t("browser.suggestUrl")}
                </span>
                <strong>{item.label}</strong>
                {item.hint ? <small>{item.hint}</small> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );

  return (
    <div className={`vs-browser${compact ? " is-compact" : ""}`}>
      {compact ? (
        <div className="vs-browserNavBar" data-no-drag>
          {urlField(true)}
          {!isVsCode ? (
            <button
              type="button"
              className={`vs-termIconBtn${inspector ? " is-active" : ""}`}
              disabled={!loadedUrl}
              title={t("browser.inspectHint")}
              aria-label={t("browser.inspect")}
              aria-pressed={inspector}
              onClick={toggleInspector}
            >
              <IconInspect size={14} />
            </button>
          ) : null}
          <button
            type="button"
            className="vs-termIconBtn"
            disabled={!loadedUrl}
            title={t("browser.devtools")}
            aria-label={t("browser.devtools")}
            onClick={openNativeDevtools}
          >
            <IconCodeBrowser size={14} />
          </button>
          <button
            type="button"
            className="vs-termIconBtn"
            title={t("browser.external")}
            aria-label={t("browser.external")}
            onClick={openExternal}
          >
            <IconExternalLink size={14} />
          </button>
        </div>
      ) : (
        <div className="vs-browserBar" data-no-drag>
          {urlField(false)}
          <button
            type="button"
            className="vs-btn vs-browserUtilityBtn"
            disabled={!loadedUrl}
            title={t("browser.reload")}
            aria-label={t("browser.reload")}
            onClick={reload}
          >
            <IconRefresh size={15} />
          </button>
          {!isVsCode ? (
            <button
              type="button"
              className={`vs-btn vs-browserUtilityBtn${inspector ? " is-active" : ""}`}
              disabled={!loadedUrl}
              title={t("browser.inspectHint")}
              aria-label={t("browser.inspect")}
              aria-pressed={inspector}
              onClick={toggleInspector}
            >
              <IconInspect size={15} />
            </button>
          ) : null}
          <button
            type="button"
            className="vs-btn vs-browserUtilityBtn"
            disabled={!loadedUrl}
            title={t("browser.devtools")}
            aria-label={t("browser.devtools")}
            onClick={openNativeDevtools}
          >
            <IconCodeBrowser size={15} />
          </button>
          <button
            type="button"
            className="vs-btn vs-browserUtilityBtn is-external"
            title={t("browser.external")}
            aria-label={t("browser.external")}
            onClick={openExternal}
          >
            <IconExternalLink size={15} />
          </button>
        </div>
      )}

      {/* Host is always mounted so WebView2 bounds exist before the first create. */}
      <div className="vs-browserViewport">
        <div className="vs-browserFrameWrap" ref={bindHost}>
          <div
            className={`vs-browserNativeSlot${loadedUrl && live && !busy ? " is-covered" : ""}`}
          >
            {loadedUrl && (busy || !live) ? (
              <span className={`vs-browserLoadPulse${busy ? " is-busy" : ""}`}>
                {busy ? t("browser.loading") : localError || t("browser.waiting")}
              </span>
            ) : null}
          </div>
        </div>
        {!loadedUrl ? (
          <div
            className={`vs-browserEmpty vs-browserStart${compact ? " is-compact" : ""}`}
            data-no-drag
          >
            {!compact ? (
              <>
                <div className="vs-browserStartMark" aria-hidden>
                  <IconSearch size={22} />
                </div>
                <h3>{t("browser.emptyTitle")}</h3>
                <p>{t("browser.emptyBody")}</p>
              </>
            ) : null}
            {localError ? <p className="vs-browserEmptyError">{localError}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
