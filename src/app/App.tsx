import { lazy, Suspense, useEffect, useState } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { AssistPanel, type AssistTab } from "@/components/shell/AssistPanel";
import { NewSpaceModal } from "@/components/shell/NewSpaceModal";
import { SpaceSettingsModal } from "@/components/shell/SpaceSettingsModal";
import { useHotkeys } from "@/features/hotkeys/useHotkeys";
import { isCapturingHotkey } from "@/features/hotkeys/bindings";
import { SpaceProvider, useSpace, useView } from "@/features/workspace/SpaceContext";
import { SpacePage } from "@/pages/space/SpacePage";
import { installUiZoom } from "@/features/ui/zoom";
import { ZoomHud } from "@/components/shell/ZoomHud";
import { revealMainWindow } from "@/features/ui/revealWindow";
import { useWindowChrome } from "@/features/ui/useWindowChrome";
import { applyAttentionPrefs } from "@/features/attention/prefs";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { ensureAutoCookieImport } from "@/features/browser/autoCookies";
import { StatusBar } from "@/components/shell/StatusBar";
import { HelpGuide } from "@/components/shell/HelpGuide";
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
const SIDEBAR_KEY = "voxiva-space-sidebar-collapsed";

function PageLoading({ label }: { label: string }) {
  return <div className="vs-pageLoading" role="status" aria-live="polite"><span aria-hidden />{label}</div>;
}

function AppShell() {
  const { setBrowserUrl, isVsCodeFocusActive, t } = useSpace();
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === "1"; } catch { return false; }
  });
  const [assistTab, setAssistTab] = useState<AssistTab>("browser");
  const [pendingAssistUrl, setPendingAssistUrl] = useState<string | null>(null);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [spaceSettingsId, setSpaceSettingsId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Mount each view once, then keep it alive (hidden) so switches don't remount/lag.
  const [mountedViews, setMountedViews] = useState<Set<ViewId>>(() => new Set(["space"]));

  useEffect(() => {
    const active = newSpaceOpen || Boolean(spaceSettingsId) || paletteOpen || helpOpen;
    window.dispatchEvent(
      new CustomEvent("voxiva-native-overlay", {
        detail: { key: "app-overlay", active },
      }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("voxiva-native-overlay", {
          detail: { key: "app-overlay", active: false },
        }),
      );
    };
  }, [helpOpen, newSpaceOpen, paletteOpen, spaceSettingsId]);

  useEffect(() => {
    const onHelp = () => setHelpOpen(true);
    window.addEventListener("voxiva-help-open", onHelp);
    return () => window.removeEventListener("voxiva-help-open", onHelp);
  }, []);

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
    try { localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (view === "settings") setAssistOpen(false);
  }, [view]);

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
    if (new URLSearchParams(window.location.search).has("smoke")) return;
    const idle = window.setTimeout(() => {
      void ensureAutoCookieImport(false);
    }, 1200);
    return () => window.clearTimeout(idle);
  }, []);

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

  // Warm small route chunks after first paint; keep their pages unmounted until opened.
  useEffect(() => {
    const idle = window.setTimeout(() => {
      void Promise.all([
        import("@/pages/agents/AgentsPage"),
        import("@/pages/browser/BrowserPage"),
        import("@/pages/history/HistoryPage"),
        import("@/pages/board/BoardPage"),
        import("@/pages/projects/ProjectsPage"),
        import("@/pages/settings/SettingsPage"),
      ]);
    }, 1200);
    return () => window.clearTimeout(idle);
  }, []);

  const show = (id: ViewId) => view === id;
  const keep = (id: ViewId) => mountedViews.has(id);

  return (
    <div
      className={`vs-root${assistOpen ? " is-assistOpen" : ""}${sidebarCollapsed ? " is-sidebarCollapsed" : ""}${view === "space" ? " is-spaceView" : ""}${view === "settings" ? " is-settingsView" : ""}`}
    >
      <Sidebar
        onNewSpace={() => setNewSpaceOpen(true)}
        assistOpen={assistOpen}
        onToggleAssist={() => setAssistOpen((v) => !v)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
      />
      <main className="vs-main">
        <Topbar />
        <ZoomHud />
        <div className="vs-mainBody">
          <div
            className={`vs-content${
              view === "space" || view === "browser" || view === "board" || view === "settings"
                ? ""
                : " is-scroll"
            }`}
          >
            <div data-view-slot="space" className={`vs-viewSlot${show("space") ? " is-active" : ""}`} hidden={!show("space")}>
              <SpacePage />
            </div>
            {keep("projects") ? (
              <div data-view-slot="projects" className={`vs-viewSlot${show("projects") ? " is-active" : ""}`} hidden={!show("projects")}>
                <Suspense fallback={<PageLoading label={t("app.loading")} />}>
                  <ProjectsPage />
                </Suspense>
              </div>
            ) : null}
            {keep("agents") ? (
              <div data-view-slot="agents" className={`vs-viewSlot${show("agents") ? " is-active" : ""}`} hidden={!show("agents")}>
                <Suspense fallback={<PageLoading label={t("app.loading")} />}>
                  <AgentsPage />
                </Suspense>
              </div>
            ) : null}
            {keep("board") ? (
              <div data-view-slot="board" className={`vs-viewSlot${show("board") ? " is-active" : ""}`} hidden={!show("board")}>
                <Suspense fallback={<PageLoading label={t("app.loading")} />}>
                  <BoardPage />
                </Suspense>
              </div>
            ) : null}
            {keep("history") ? (
              <div data-view-slot="history" className={`vs-viewSlot${show("history") ? " is-active" : ""}`} hidden={!show("history")}>
                <Suspense fallback={<PageLoading label={t("app.loading")} />}>
                  <HistoryPage />
                </Suspense>
              </div>
            ) : null}
            {keep("browser") ? (
              <div data-view-slot="browser" className={`vs-viewSlot${show("browser") ? " is-active" : ""}`} hidden={!show("browser")}>
                <Suspense fallback={<PageLoading label={t("app.loading")} />}>
                  <BrowserPage />
                </Suspense>
              </div>
            ) : null}
            {keep("settings") ? (
              <div data-view-slot="settings" className={`vs-viewSlot${show("settings") ? " is-active" : ""}`} hidden={!show("settings")}>
                <Suspense fallback={<PageLoading label={t("app.loading")} />}>
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
      <StatusBar />
      <NewSpaceModal open={newSpaceOpen} onClose={() => setNewSpaceOpen(false)} />
      <SpaceSettingsModal workspaceId={spaceSettingsId} onClose={() => setSpaceSettingsId(null)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <HelpGuide open={helpOpen} onClose={() => setHelpOpen(false)} />
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
