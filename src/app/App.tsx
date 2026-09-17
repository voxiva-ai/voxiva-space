import { lazy, Suspense, useEffect, useState } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { AssistPanel, type AssistTab } from "@/components/shell/AssistPanel";
import { NewSpaceModal } from "@/components/shell/NewSpaceModal";
import { SpaceSettingsModal } from "@/components/shell/SpaceSettingsModal";
import { useHotkeys } from "@/features/hotkeys/useHotkeys";
import { isCapturingHotkey } from "@/features/hotkeys/bindings";
import { browserClose, browserCloseAll, browserHideAll } from "@/features/browser/api";
import { SpaceProvider, useSpace, useView } from "@/features/workspace/SpaceContext";
import { SpacePage } from "@/pages/space/SpacePage";
import { installUiZoom } from "@/features/ui/zoom";
import { ZoomHud } from "@/components/shell/ZoomHud";
import { revealMainWindow } from "@/features/ui/revealWindow";
import { useWindowChrome } from "@/features/ui/useWindowChrome";
import { applyAttentionPrefs } from "@/features/attention/prefs";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { ensureAutoCookieImport } from "@/features/browser/autoCookies";
import { WelcomePage } from "@/pages/welcome/WelcomePage";
import type { ViewId } from "@/lib/types";

const AgentsPage = lazy(() =>
  import("@/pages/agents/AgentsPage").then((module) => ({ default: module.AgentsPage })),
);
const BrowserPage = lazy(() =>
  import("@/pages/browser/BrowserPage").then((module) => ({ default: module.BrowserPage })),
);
const HistoryPage = lazy(() =>
  import("@/pages/history/HistoryPage").then((module) => ({ default: module.HistoryPage })),
);
const BoardPage = lazy(() =>
  import("@/pages/board/BoardPage").then((module) => ({ default: module.BoardPage })),
);
const ProjectsPage = lazy(() =>
  import("@/pages/projects/ProjectsPage").then((module) => ({ default: module.ProjectsPage })),
);
const SettingsPage = lazy(() =>
  import("@/pages/settings/SettingsPage").then((module) => ({ default: module.SettingsPage })),
);

const ASSIST_KEY = "voxiva-space-assist-open";

function GlobalToast() {
  const { error, setError, suggestedLocalUrl, dismissSuggestedLocalUrl, t } = useSpace();

  // Localhost preview opens in assist browser silently — no toast.
  useEffect(() => {
    if (suggestedLocalUrl) dismissSuggestedLocalUrl();
  }, [dismissSuggestedLocalUrl, suggestedLocalUrl]);

  if (!error) return null;

  return (
    <div className="vs-globalToastStack" role="status">
      {error ? (
        <div className="vs-globalToast" role="alert">
          <span>{error}</span>
          <button type="button" className="vs-btn vs-btnGhost" onClick={() => setError("")}>
            {t("toast.ok")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AppShell() {
  const { welcomeVisible, setBrowserUrl, isVsCodeFocusActive } = useSpace();
  const { view } = useView();
  useHotkeys();
  useWindowChrome();
  useEffect(() => {
    // Mouse clicks shouldn't leave a sticky focus highlight on chrome buttons.
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const btn = target.closest(
        "button.vs-iconBtn, button.vs-btn, button.vs-railBtn, button.vs-navItem, button.vs-fileRow, button.vs-wsItemMore",
      );
      if (!(btn instanceof HTMLElement)) return;
      event.preventDefault();
    };
    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, []);

  useEffect(() => installUiZoom(), []);
  useEffect(() => {
    applyAttentionPrefs();
  }, []);
  useEffect(() => {
    // Show after first paint + theme so the transparent window never flashes empty.
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        void revealMainWindow();
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, []);
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistTab, setAssistTab] = useState<AssistTab>("browser");
  const [pendingAssistUrl, setPendingAssistUrl] = useState<string | null>(null);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [spaceSettingsId, setSpaceSettingsId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Mount each view once, then keep it alive (hidden) so switches don't remount/lag.
  const [mountedViews, setMountedViews] = useState<Set<ViewId>>(() => new Set(["space"]));

  useEffect(() => {
    setMountedViews((prev) => {
      if (prev.has(view)) return prev;
      const next = new Set(prev);
      next.add(view);
      return next;
    });
  }, [view]);

  useEffect(() => {
    try {
      // Never restore assist open on next launch — only remember closed.
      localStorage.setItem(ASSIST_KEY, "0");
    } catch {
      // ignore
    }
  }, [assistOpen]);

  useEffect(() => {
    const onNewSpace = () => setNewSpaceOpen(true);
    const onSpaceSettings = (event: Event) => {
      const id = (event as CustomEvent<{ workspaceId?: string }>).detail?.workspaceId;
      if (id) setSpaceSettingsId(id);
    };
    const onVault = () => {
      setAssistTab("agents");
      setAssistOpen(true);
    };
    window.addEventListener("voxiva-new-space", onNewSpace);
    window.addEventListener("voxiva-space-settings", onSpaceSettings);
    window.addEventListener("voxiva-open-vault", onVault);
    return () => {
      window.removeEventListener("voxiva-new-space", onNewSpace);
      window.removeEventListener("voxiva-space-settings", onSpaceSettings);
      window.removeEventListener("voxiva-open-vault", onVault);
    };
  }, []);

  useEffect(() => {
    if (welcomeVisible) return;
    const idle = window.setTimeout(() => {
      void ensureAutoCookieImport(false);
    }, 1200);
    return () => window.clearTimeout(idle);
  }, [welcomeVisible]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isCapturingHotkey()) return;
      if (isVsCodeFocusActive) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isVsCodeFocusActive]);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail =
        (event as CustomEvent<{ tab?: AssistTab; path?: string; url?: string }>).detail ?? {};
      if (detail.url) {
        setBrowserUrl(detail.url);
        setPendingAssistUrl(detail.url);
      }
      if (detail.tab === "browser" || detail.tab === "agents") setAssistTab(detail.tab);
      setAssistOpen(true);
    };
    window.addEventListener("voxiva-assist-open", onOpen);
    return () => {
      window.removeEventListener("voxiva-assist-open", onOpen);
    };
  }, [setBrowserUrl]);

  // Prefetch agents after first paint so the view opens instantly.
  useEffect(() => {
    if (welcomeVisible) return;
    const idle = window.setTimeout(() => {
      void import("@/pages/agents/AgentsPage");
    }, 400);
    return () => window.clearTimeout(idle);
  }, [welcomeVisible]);

  useEffect(() => {
    if (welcomeVisible) {
      void browserCloseAll().catch(() => undefined);
      return;
    }
    const assistBrowser = assistOpen && assistTab === "browser";
    if (view === "browser") {
      void browserCloseAll("browser-page").catch(() => undefined);
      return;
    }
    if (view === "space") {
      void browserClose("browser-page").catch(() => undefined);
      if (!assistBrowser) void browserClose("browser-assist").catch(() => undefined);
      return;
    }
    // Agents / projects / … — hide pane browsers, don't destroy them.
    void browserHideAll().catch(() => undefined);
    void browserClose("browser-page").catch(() => undefined);
    if (!assistBrowser) void browserClose("browser-assist").catch(() => undefined);
  }, [assistOpen, assistTab, welcomeVisible, view]);

  if (welcomeVisible) {
    return (
      <>
        <WelcomePage />
        <GlobalToast />
      </>
    );
  }

  const show = (id: ViewId) => view === id;
  const keep = (id: ViewId) => mountedViews.has(id);

  return (
    <div
      className={`vs-root${assistOpen ? " is-assistOpen" : ""}${view === "space" ? " is-spaceView" : ""}`}
    >
      <Sidebar
        onNewSpace={() => setNewSpaceOpen(true)}
        assistOpen={assistOpen}
        onToggleAssist={() => setAssistOpen((v) => !v)}
      />
      <main className="vs-main">
        <Topbar />
        <GlobalToast />
        <ZoomHud />
        <div className="vs-mainBody">
          <div
            className={`vs-content${
              view === "space" || view === "browser" || view === "board" || view === "settings"
                ? ""
                : " is-scroll"
            }`}
          >
            <div className={`vs-viewSlot${show("space") ? " is-active" : ""}`} hidden={!show("space")}>
              <SpacePage />
            </div>
            {keep("projects") ? (
              <div className={`vs-viewSlot${show("projects") ? " is-active" : ""}`} hidden={!show("projects")}>
                <Suspense fallback={null}>
                  <ProjectsPage />
                </Suspense>
              </div>
            ) : null}
            {keep("agents") ? (
              <div className={`vs-viewSlot${show("agents") ? " is-active" : ""}`} hidden={!show("agents")}>
                <Suspense fallback={null}>
                  <AgentsPage />
                </Suspense>
              </div>
            ) : null}
            {keep("board") ? (
              <div className={`vs-viewSlot${show("board") ? " is-active" : ""}`} hidden={!show("board")}>
                <Suspense fallback={null}>
                  <BoardPage />
                </Suspense>
              </div>
            ) : null}
            {keep("history") ? (
              <div className={`vs-viewSlot${show("history") ? " is-active" : ""}`} hidden={!show("history")}>
                <Suspense fallback={null}>
                  <HistoryPage />
                </Suspense>
              </div>
            ) : null}
            {keep("browser") ? (
              <div className={`vs-viewSlot${show("browser") ? " is-active" : ""}`} hidden={!show("browser")}>
                <Suspense fallback={null}>
                  <BrowserPage />
                </Suspense>
              </div>
            ) : null}
            {keep("settings") ? (
              <div className={`vs-viewSlot${show("settings") ? " is-active" : ""}`} hidden={!show("settings")}>
                <Suspense fallback={null}>
                  <SettingsPage />
                </Suspense>
              </div>
            ) : null}
          </div>
          <AssistPanel
            open={assistOpen}
            tab={assistTab}
            onTabChange={setAssistTab}
            onClose={() => setAssistOpen(false)}
            pendingUrl={pendingAssistUrl}
            onPendingUrlConsumed={() => setPendingAssistUrl(null)}
          />
        </div>
      </main>
      <NewSpaceModal open={newSpaceOpen} onClose={() => setNewSpaceOpen(false)} />
      <SpaceSettingsModal workspaceId={spaceSettingsId} onClose={() => setSpaceSettingsId(null)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <SpaceProvider>
      <AppShell />
    </SpaceProvider>
  );
}
