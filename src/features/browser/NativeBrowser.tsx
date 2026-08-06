import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  browserClose,
  browserConfigureInspector,
  browserHide,
  browserOpen,
  browserOpenDevtools,
  browserReload,
  browserSetBounds,
  browserTakeInspectorEvent,
  browserToggleInspector,
  findComponentFiles,
  type BrowserSelection,
} from "@/features/browser/api";
import {
  IconCodeBrowser,
  IconExternalLink,
  IconGrip,
  IconInspect,
  IconRefresh,
  IconSearch,
  IconX,
} from "@/components/icons";
import { agentBots, isBotReady, resolveBotCommand } from "@/features/agents/bots";
import { useSpace } from "@/features/workspace/SpaceContext";
import { clientError } from "@/lib/errors";
import { openUrl, writeTerminalSession } from "@/features/terminal/api";
import { normalizeBrowserUrl, suggestBrowserUrls } from "./url";

type NativeBrowserProps = {
  url: string;
  onUrlChange: (url: string) => void;
  compact?: boolean;
  dragPaneId?: string;
  onClose?: () => void;
  instanceId?: string;
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
  compact = false,
  dragPaneId,
  onClose,
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
  const restoredRef = useRef(false);
  const inspectorRef = useRef(false);
  const [draft, setDraft] = useState(url || "");
  const [loadedUrl, setLoadedUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const bindHost = useCallback((node: HTMLDivElement | null) => {
    hostRef.current = node;
    setHostEl(node);
  }, []);
  const [inspector, setInspector] = useState(false);
  const [selection, setSelection] = useState<BrowserSelection | null>(null);
  const [componentFiles, setComponentFiles] = useState<string[]>([]);
  const [filesBusy, setFilesBusy] = useState(false);
  const presets = useMemo(
    () => suggestBrowserUrls(activeWorkspace?.cwd),
    [activeWorkspace?.cwd],
  );
  const availableAgents = useMemo(
    () =>
      agentBots.filter(
        (bot) => bot.command && (!agentsScanned || isBotReady(bot, agentAvailability, true)),
      ),
    [agentAvailability, agentsScanned],
  );
  const inspectorAgents = useMemo(
    () => availableAgents.map(({ id, name }) => ({ id, name })),
    [availableAgents],
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
      for (let attempt = 0; attempt < 20 && !bounds; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 35));
        if (!aliveRef.current) return;
        bounds = readBounds();
      }
      if (!bounds || !aliveRef.current) throw new Error("Browser area is not ready");
      lastBounds.current = bounds;
      setBusy(true);
      await browserOpen({ label, url: next, ...bounds, navigate });
      if (!aliveRef.current) {
        await browserClose(label).catch(() => undefined);
        return;
      }
      openedRef.current = true;
      setLoadedUrl(next);
      setLive(true);
      requestAnimationFrame(() => {
        void syncBounds();
      });
      window.setTimeout(() => {
        if (aliveRef.current) setBusy(false);
      }, 600);
    },
    [label, readBounds, syncBounds],
  );

  const clearBrowser = useCallback(async () => {
    setDraft("");
    setLoadedUrl("");
    onUrlChange("");
    setLive(false);
    setBusy(false);
    setInspector(false);
    inspectorRef.current = false;
    setSelection(null);
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
      const next = normalizeBrowserUrl(source);
      if (!next) {
        await clearBrowser();
        return;
      }
      setDraft(next);
      setLoadedUrl(next);
      onUrlChange(next);
      try {
        await openAt(next, true);
      } catch (error) {
        if (!aliveRef.current) return;
        setBusy(false);
        setLive(false);
        setError(clientError(error));
      }
    },
    [clearBrowser, draft, onUrlChange, openAt, setError],
  );

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const initial = normalizeBrowserUrl(url || "");
    if (initial) void go(initial);
  }, [go, url]);

  useEffect(() => {
    if (!hostEl) return;
    const observer = new ResizeObserver(scheduleBounds);
    observer.observe(hostEl);
    window.addEventListener("resize", scheduleBounds);
    window.visualViewport?.addEventListener("resize", scheduleBounds);
    window.addEventListener("transitionend", scheduleBounds);
    scheduleBounds();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleBounds);
      window.visualViewport?.removeEventListener("resize", scheduleBounds);
      window.removeEventListener("transitionend", scheduleBounds);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [hostEl, scheduleBounds]);

  useEffect(() => {
    const onDrag = (event: Event) => {
      const active = Boolean((event as CustomEvent<{ active?: boolean }>).detail?.active);
      suppressedRef.current = active;
      if (!openedRef.current) return;
      if (active) {
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
  }, [draft, label, loadedUrl, openAt, syncBounds]);

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
        if (inspectorRef.current) {
          void browserToggleInspector(label, true).catch(() => undefined);
        }
        void browserConfigureInspector(label, inspectorAgents, componentFiles).catch(
          () => undefined,
        );
      },
    );
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [componentFiles, inspectorAgents, label, onUrlChange]);

  useEffect(() => {
    if (!loadedUrl) return;
    let stopped = false;
    let inFlight = false;
    const poll = async () => {
      if (stopped || inFlight || !openedRef.current) return;
      inFlight = true;
      try {
        const event = await browserTakeInspectorEvent(label);
        if (!event || stopped) return;
        if (event.selection) {
          const picked = event.selection;
          setSelection(picked);
          setComponentFiles([]);
          lastBounds.current = null;
          requestAnimationFrame(() => requestAnimationFrame(scheduleBounds));
          if (activeWorkspace?.cwd) {
            setFilesBusy(true);
            void findComponentFiles(activeWorkspace.cwd, picked)
              .then((files) => {
                setComponentFiles(files);
                return browserConfigureInspector(label, inspectorAgents, files);
              })
              .catch(() => undefined)
              .finally(() => setFilesBusy(false));
          } else {
            void browserConfigureInspector(label, inspectorAgents, []).catch(() => undefined);
          }
        }
        if (event.action) {
          void sendSelectionToAgent(
            event.action.selection,
            event.action.instruction,
            event.action.agentId,
          );
        }
      } catch {
        // Page can briefly reject evaluation while navigating.
      } finally {
        inFlight = false;
      }
    };
    void browserConfigureInspector(label, inspectorAgents, componentFiles).catch(() => undefined);
    void poll();
    const timer = window.setInterval(() => void poll(), 220);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activeWorkspace?.cwd, componentFiles, inspectorAgents, label, loadedUrl, scheduleBounds]);

  function reload() {
    if (!openedRef.current) return;
    setBusy(true);
    void browserReload(label).catch((error) => {
      setBusy(false);
      setError(clientError(error));
    });
  }

  useEffect(() => {
    const onReload = () => {
      const current = loadedUrl || draft;
      if (!openedRef.current || !current) return;
      if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(current) && !/^file:/i.test(current)) {
        return;
      }
      reload();
    };
    window.addEventListener("voxiva-preview-reload", onReload);
    return () => window.removeEventListener("voxiva-preview-reload", onReload);
  }, [draft, label, loadedUrl]);

  function openNativeDevtools() {
    if (!openedRef.current) {
      setError(t("browser.devtoolsNeedSite"));
      return;
    }
    void browserOpenDevtools(label).catch((error) => {
      setError(clientError(error) || t("browser.devtoolsFailed"));
    });
  }

  function toggleInspector() {
    if (!openedRef.current) {
      setError(t("browser.devtoolsNeedSite"));
      return;
    }
    const next = !inspectorRef.current;
    inspectorRef.current = next;
    setInspector(next);
    if (next) {
      void browserConfigureInspector(label, inspectorAgents, componentFiles).catch(() => undefined);
    }
    void browserToggleInspector(label, next).catch((error) => {
      inspectorRef.current = false;
      setInspector(false);
      setError(clientError(error));
    });
  }

  function openExternal() {
    const next = normalizeBrowserUrl(draft || loadedUrl);
    if (next) void openUrl(next).catch((error) => setError(clientError(error)));
  }

  function openRelatedFile(rel: string) {
    window.dispatchEvent(
      new CustomEvent("voxiva-assist-open", { detail: { tab: "editor", path: rel } }),
    );
  }

  async function sendSelectionToAgent(
    picked: BrowserSelection,
    instruction: string,
    agentId: string,
  ) {
    const bot = availableAgents.find((item) => item.id === agentId);
    if (!bot || !instruction.trim()) return;
    const sessionId = await launchAgent({
      title: bot.name,
      command: resolveBotCommand(bot, agentAvailability),
      accent: bot.accent,
    });
    if (!sessionId) return;
    const files = componentFiles.length ? componentFiles.join(", ") : "not detected";
    const prompt = [
      instruction.trim().replace(/\s+/g, " "),
      `Selected UI: ${picked.component || picked.tag}`,
      `selector: ${picked.selector}`,
      `page: ${picked.pageUrl}`,
      `likely files: ${files}`,
      `visible text: ${picked.text.replace(/\s+/g, " ").slice(0, 240) || "none"}`,
    ].join(". ");
    // Short settle so the agent CLI is ready to accept the prompt.
    window.setTimeout(() => {
      void writeTerminalSession(sessionId, `${prompt}\r`).catch((error) =>
        setError(clientError(error)),
      );
    }, 350);
  }

  return (
    <div className={`vs-browser${compact ? " is-compact" : ""}`}>
      <div
        className={compact ? "vs-browserCompactBar" : "vs-browserBar"}
        data-pane-drag={compact ? dragPaneId : undefined}
        data-no-drag={compact ? undefined : true}
      >
        {compact && (
          <span className="vs-browserDragHandle" title={t("term.drag")} aria-hidden>
            <IconGrip size={14} />
          </span>
        )}
        <div className="vs-browserUrlField" data-no-drag>
          <IconSearch size={15} className="vs-browserSearchIcon" />
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void go();
            }}
            spellCheck={false}
            placeholder={t("browser.urlPlaceholder")}
            aria-label="URL"
          />
        </div>
        <button
          type="button"
          className="vs-btn vs-browserUtilityBtn"
          data-no-drag
          disabled={!loadedUrl}
          title={t("browser.reload")}
          aria-label={t("browser.reload")}
          onClick={reload}
        >
          <IconRefresh size={15} />
        </button>
        <button
          type="button"
          className={`vs-btn vs-browserUtilityBtn${inspector ? " is-active" : ""}`}
          data-no-drag
          disabled={!loadedUrl}
          title={t("browser.inspect")}
          aria-label={t("browser.inspect")}
          aria-pressed={inspector}
          onClick={toggleInspector}
        >
          <IconInspect size={15} />
        </button>
        <button
          type="button"
          className="vs-btn vs-browserUtilityBtn"
          data-no-drag
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
          data-no-drag
          title={t("browser.external")}
          aria-label={t("browser.external")}
          onClick={openExternal}
        >
          <IconExternalLink size={15} />
        </button>
        {compact && onClose && (
          <button
            type="button"
            className="vs-btn vs-btnGhost vs-browserUtilityBtn"
            data-no-drag
            title={t("term.close")}
            aria-label={t("term.close")}
            onClick={onClose}
          >
            <IconX size={14} />
          </button>
        )}
      </div>

      {!loadedUrl ? (
        <div className="vs-browserEmpty vs-browserStart" data-no-drag>
          <div className="vs-browserStartMark" aria-hidden>
            <IconSearch size={22} />
          </div>
          <h3>{t("browser.emptyTitle")}</h3>
          <p>{t("browser.emptyBody")}</p>
          <form
            className="vs-browserStartSearch"
            onSubmit={(event) => {
              event.preventDefault();
              void go();
            }}
          >
            <IconSearch size={16} className="vs-browserSearchIcon" />
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("browser.urlPlaceholder")}
              spellCheck={false}
              autoFocus={!compact}
              aria-label={t("browser.urlPlaceholder")}
            />
          </form>
          <div className="vs-browserStartGroup">
            <span>{t("browser.suggestTitle")}</span>
            <div className="vs-browserPresets">
              {presets.map((preset) => (
                <button
                  key={preset.url}
                  type="button"
                  className="vs-browserPresetCard"
                  onClick={() => void go(preset.url)}
                >
                  <strong>{preset.label}</strong>
                  <small>{preset.url.replace(/^https?:\/\//, "")}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="vs-browserViewport">
          <div className="vs-browserFrameWrap" ref={bindHost}>
            <div className={`vs-browserNativeSlot${live && !busy ? " is-covered" : ""}`}>
              {(busy || !live) && (
                <span className={`vs-browserLoadPulse${busy ? " is-busy" : ""}`}>
                  {busy ? t("browser.loading") : t("browser.waiting")}
                </span>
              )}
            </div>
          </div>
          {(inspector && (selection || filesBusy || componentFiles.length > 0)) && (
            <div className="vs-browserRelated" data-no-drag>
              <span className="vs-browserRelatedLabel">{t("browser.relatedFiles")}</span>
              {filesBusy && <em>{t("browser.findingFiles")}</em>}
              {!filesBusy && componentFiles.length === 0 && (
                <em>{t("browser.filesNotFound")}</em>
              )}
              {componentFiles.map((file) => (
                <button
                  key={file}
                  type="button"
                  className="vs-browserRelatedFile"
                  title={file}
                  onClick={() => openRelatedFile(file)}
                >
                  {file.replace(/^.*[\\/]/, "")}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
