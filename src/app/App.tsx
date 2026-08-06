import { lazy, Suspense, useEffect, useState } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { AssistPanel, type AssistTab } from "@/components/shell/AssistPanel";
import { NewSpaceModal } from "@/components/shell/NewSpaceModal";
import { useHotkeys } from "@/features/hotkeys/useHotkeys";
import { eventMatchesBinding, loadHotkeys } from "@/features/hotkeys/bindings";
import { browserClose, browserCloseAll } from "@/features/browser/api";
import { SpaceProvider, useSpace } from "@/features/workspace/SpaceContext";
import { AgentsPage } from "@/pages/agents/AgentsPage";
import { BrowserPage } from "@/pages/browser/BrowserPage";
import { HistoryPage } from "@/pages/history/HistoryPage";
import { BoardPage } from "@/pages/board/BoardPage";
import { ProjectsPage } from "@/pages/projects/ProjectsPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import { SpacePage } from "@/pages/space/SpacePage";
import { installUiZoom } from "@/features/ui/zoom";
import { WelcomePage } from "@/pages/welcome/WelcomePage";

const EditorPage = lazy(() =>
  import("@/pages/editor/EditorPage").then((module) => ({ default: module.EditorPage })),
);

const SIDEBAR_KEY = "voxiva-space-sidebar-collapsed";
const ASSIST_KEY = "voxiva-space-assist-open";

function GlobalToast() {
  const {
    error,
    setError,
    suggestedLocalUrl,
    dismissSuggestedLocalUrl,
    openBrowserWithUrl,
    view,
    t,
  } = useSpace();

  // Suggest only while working in the Space grid — not on full Browser page / other views.
  useEffect(() => {
    if (view !== "space" && suggestedLocalUrl) {
      dismissSuggestedLocalUrl();
    }
  }, [dismissSuggestedLocalUrl, suggestedLocalUrl, view]);

  if (view !== "space") {
    if (!error) return null;
  }

  if (!error && !suggestedLocalUrl) return null;

  return (
    <div className="vs-globalToastStack" role="status">
      {view === "space" && suggestedLocalUrl ? (
        <div className="vs-globalToast is-suggest">
          <span>
            {t("browser.suggestLocal")}{" "}
            <strong className="vs-mono">{suggestedLocalUrl}</strong>
          </span>
          <div className="vs-globalToastActions">
            <button
              type="button"
              className="vs-btn vs-btnPrimary"
              onClick={() => void openBrowserWithUrl(suggestedLocalUrl)}
            >
              {t("browser.openSuggest")}
            </button>
            <button type="button" className="vs-btn vs-btnGhost" onClick={dismissSuggestedLocalUrl}>
              {t("toast.ok")}
            </button>
          </div>
        </div>
      ) : null}
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
  const { view, onboarded, t, setBrowserUrl } = useSpace();
  useHotkeys();
  useEffect(() => installUiZoom(), []);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [assistOpen, setAssistOpen] = useState(() => {
    try {
      return localStorage.getItem(ASSIST_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [assistTab, setAssistTab] = useState<AssistTab>("editor");
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [pendingAssistUrl, setPendingAssistUrl] = useState<string | null>(null);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(ASSIST_KEY, assistOpen ? "1" : "0");
    } catch {
      // ignore
    }
  }, [assistOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        const inTerm = Boolean(
          target.closest(".xterm") ||
            target.closest(".vs-xtermHost") ||
            target.classList.contains("xterm-helper-textarea"),
        );
        if (!inTerm && (tag === "TEXTAREA" || tag === "INPUT" || target.isContentEditable)) return;
      }
      const binding = loadHotkeys().sidebar;
      if (!eventMatchesBinding(event, binding)) return;
      if (
        target instanceof HTMLElement &&
        (target.closest(".xterm") || target.closest(".vs-xtermHost")) &&
        !(binding.alt || binding.ctrl)
      ) {
        return;
      }
      event.preventDefault();
      setSidebarCollapsed((v) => !v);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail =
        (event as CustomEvent<{ tab?: AssistTab; path?: string; url?: string }>).detail ?? {};
      if (detail.path) setPendingPath(detail.path);
      if (detail.url) {
        setBrowserUrl(detail.url);
        setPendingAssistUrl(detail.url);
      }
      if (detail.tab === "browser" || detail.tab === "editor") setAssistTab(detail.tab);
      else if (detail.path) setAssistTab("editor");
      setAssistOpen(true);
    };
    window.addEventListener("voxiva-assist-open", onOpen);
    return () => window.removeEventListener("voxiva-assist-open", onOpen);
  }, [setBrowserUrl]);

  useEffect(() => {
    const onNew = () => setNewSpaceOpen(true);
    window.addEventListener("voxiva-new-space", onNew);
    return () => window.removeEventListener("voxiva-new-space", onNew);
  }, []);

  useEffect(() => {
    if (!onboarded) {
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
    if (assistBrowser) {
      void browserCloseAll("browser-assist").catch(() => undefined);
      return;
    }
    void browserCloseAll().catch(() => undefined);
  }, [assistOpen, assistTab, onboarded, view]);

  if (!onboarded) {
    return (
      <>
        <WelcomePage />
        <GlobalToast />
      </>
    );
  }

  return (
    <div
      className={`vs-root${sidebarCollapsed ? " is-sidebarCollapsed" : ""}${assistOpen ? " is-assistOpen" : ""}`}
    >
      <Sidebar
        collapsed={sidebarCollapsed}
        onCollapse={() => setSidebarCollapsed(true)}
        onExpand={() => setSidebarCollapsed(false)}
        onNewSpace={() => setNewSpaceOpen(true)}
      />
      <main className="vs-main">
        <Topbar
          assistOpen={assistOpen}
          onToggleAssist={() => setAssistOpen((v) => !v)}
          sidebarCollapsed={sidebarCollapsed}
          onExpandSidebar={() => setSidebarCollapsed(false)}
        />
        <GlobalToast />
        <div className="vs-mainBody">
          <div
            className={`vs-content${
              view === "space" || view === "browser" || view === "editor" || view === "board"
                ? ""
                : " is-scroll"
            }`}
          >
            {/* Keep Space mounted so terminals keep loading while you browse other views. */}
            <div className={`vs-viewSlot${view === "space" ? " is-active" : ""}`} hidden={view !== "space"}>
              <SpacePage />
            </div>
            {view === "editor" && (
              <Suspense fallback={<div className="vs-empty">{t("editor.loading")}</div>}>
                <EditorPage />
              </Suspense>
            )}
            {view === "projects" && <ProjectsPage />}
            {view === "agents" && <AgentsPage />}
            {view === "board" && <BoardPage />}
            {view === "history" && <HistoryPage />}
            {view === "browser" && <BrowserPage />}
            {view === "settings" && <SettingsPage />}
          </div>
          <AssistPanel
            open={assistOpen}
            tab={assistTab}
            onTabChange={setAssistTab}
            onClose={() => setAssistOpen(false)}
            pendingPath={pendingPath}
            onPendingConsumed={() => setPendingPath(null)}
            pendingUrl={pendingAssistUrl}
            onPendingUrlConsumed={() => setPendingAssistUrl(null)}
          />
        </div>
      </main>
      <NewSpaceModal open={newSpaceOpen} onClose={() => setNewSpaceOpen(false)} />
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
