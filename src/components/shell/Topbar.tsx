import { useEffect, useState } from "react";
import { Folder, LayoutRight } from "@untitledui/icons";
import { IconSidebar } from "@/components/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useFolderBrowse } from "@/features/workspace/useFolderBrowse";
import { useSpace, useView } from "@/features/workspace/SpaceContext";
import type { ViewId } from "@/lib/types";
import type { MsgKey } from "@/i18n";
import { clientError } from "@/lib/errors";
import { WindowControls } from "@/components/shell/WindowControls";

function shortPath(cwd: string) {
  const normalized = cwd.replace(/\\/g, "/");
  if (normalized.length <= 52) return cwd;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 2) return cwd;
  return `…/${parts.slice(-2).join("/")}`;
}

const TITLE_KEY: Record<ViewId, MsgKey> = {
  space: "nav.space",
  editor: "nav.editor",
  projects: "nav.projects",
  agents: "nav.agents",
  board: "nav.board",
  history: "nav.history",
  browser: "nav.browser",
  settings: "nav.settings",
};

/** App-level pages — show page title only, not the workspace name. */
const APP_VIEWS = new Set<ViewId>(["agents", "history", "projects", "board"]);
/** Settings has its own left nav — skip the topbar title to avoid "Settings / SETTINGS". */
const HIDE_TOPBAR_TITLE = new Set<ViewId>(["settings"]);

type TopbarProps = {
  assistOpen: boolean;
  onToggleAssist: () => void;
  sidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
};

export function Topbar({
  assistOpen,
  onToggleAssist,
  sidebarCollapsed = false,
  onExpandSidebar,
}: TopbarProps) {
  const { activeWorkspace, updateWorkspace, setError, t } = useSpace();
  const { view } = useView();
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(activeWorkspace?.name ?? "");
  const browseFolder = useFolderBrowse();
  const showWorkspace = Boolean(activeWorkspace) && !APP_VIEWS.has(view) && !HIDE_TOPBAR_TITLE.has(view);
  // Space view: cwd chip in topbar; name lives in the sidebar.
  const showSpaceCwd = Boolean(activeWorkspace) && view === "space";
  const showMeta = showWorkspace && view !== "space";
  const showAppTitle = !showWorkspace && !HIDE_TOPBAR_TITLE.has(view);

  useEffect(() => {
    setNameDraft(activeWorkspace?.name ?? "");
    setEditing(false);
  }, [activeWorkspace?.id, activeWorkspace?.name]);

  useEffect(() => {
    const label = HIDE_TOPBAR_TITLE.has(view)
      ? t("nav.settings")
      : showWorkspace
        ? activeWorkspace!.name
        : t(TITLE_KEY[view]);
    void getCurrentWindow()
      .setTitle(label)
      .catch(() => undefined);
  }, [showWorkspace, activeWorkspace?.name, view, t]);

  async function commitName() {
    if (!activeWorkspace) return;
    const next = nameDraft.trim() || "Space";
    setEditing(false);
    if (next !== activeWorkspace.name) {
      await updateWorkspace(activeWorkspace.id, { name: next });
    }
  }

  async function changeFolder() {
    if (!activeWorkspace) return;
    try {
      const picked = await browseFolder(activeWorkspace.cwd || null);
      if (picked && picked !== activeWorkspace.cwd) {
        await updateWorkspace(activeWorkspace.id, { cwd: picked });
      }
    } catch (err) {
      setError(clientError(err));
    }
  }

  return (
    <header
      className="vs-topbar"
      data-tauri-drag-region
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
        if (e.buttons === 1) {
          void getCurrentWindow()
            .startDragging()
            .catch(() => undefined);
        }
      }}
    >
      <div className="vs-topbarLeft" data-tauri-drag-region>
        {sidebarCollapsed && onExpandSidebar ? (
          <button
            type="button"
            className="vs-iconBtn vs-topbarExpand"
            data-no-drag
            title={t("shell.expand")}
            aria-label={t("shell.expand")}
            onClick={onExpandSidebar}
          >
            <IconSidebar size={16} />
          </button>
        ) : null}
        {showSpaceCwd ? (
          <div className="vs-topbarMeta vs-topbarSpaceMeta" data-tauri-drag-region>
            <button
              type="button"
              className="vs-topbarCwdBtn"
              data-no-drag
              title={activeWorkspace!.cwd}
              onClick={() => void changeFolder()}
            >
              <Folder size={14} aria-hidden />
              <span className="vs-topbarCwdLabel">{shortPath(activeWorkspace!.cwd)}</span>
            </button>
            {activeWorkspace!.branch ? (
              <span className="vs-badge" data-no-drag>
                {activeWorkspace!.branch}
              </span>
            ) : null}
          </div>
        ) : showMeta ? (
          <div className="vs-topbarMeta" data-tauri-drag-region>
            {editing ? (
              <input
                className="vs-topbarNameInput"
                data-no-drag
                value={nameDraft}
                autoFocus
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => void commitName()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitName();
                  if (e.key === "Escape") {
                    setNameDraft(activeWorkspace!.name);
                    setEditing(false);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="vs-topbarNameBtn"
                data-no-drag
                title={t("topbar.rename")}
                onClick={() => setEditing(true)}
              >
                {activeWorkspace!.name}
              </button>
            )}
            {view !== "editor" && <span className="vs-topbarView">{t(TITLE_KEY[view])}</span>}
            {activeWorkspace!.branch && (
              <span className="vs-badge" data-no-drag>
                {activeWorkspace!.branch}
              </span>
            )}
          </div>
        ) : showAppTitle ? (
          <h1 className="vs-topbarTitle">{t(TITLE_KEY[view])}</h1>
        ) : null}
      </div>
      <div className="vs-topbarActions" data-no-drag>
        <button
          type="button"
          className={`vs-iconBtn vs-topbarAssistBtn${assistOpen ? " is-active" : ""}`}
          title={t("assist.toggle")}
          aria-label={t("assist.toggle")}
          aria-pressed={assistOpen}
          onClick={onToggleAssist}
        >
          <LayoutRight size={17} aria-hidden />
        </button>
        <WindowControls />
      </div>
    </header>
  );
}
