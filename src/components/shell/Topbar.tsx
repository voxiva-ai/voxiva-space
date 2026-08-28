import { useEffect, useRef, useState } from "react";
import { Folder } from "@untitledui/icons";
import { IconAssistPanel, IconMore, IconSidebar, IconX } from "@/components/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PromptDialog } from "@/components/PromptDialog";
import { useFolderBrowse } from "@/features/workspace/useFolderBrowse";
import { savedLayoutPaneCount } from "@/features/workspace/savedLayouts";
import { useSpace, useView } from "@/features/workspace/SpaceContext";
import type { ViewId } from "@/lib/types";
import type { MsgKey } from "@/i18n";
import { clientError } from "@/lib/errors";
import { WindowControls } from "@/components/shell/WindowControls";
import { beginWindowDrag, toggleMaximize } from "@/features/ui/windowDrag";

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

const APP_VIEWS = new Set<ViewId>(["agents", "history", "projects", "board"]);
const HIDE_TOPBAR_TITLE = new Set<ViewId>(["settings"]);

type TopbarProps = {
  assistOpen: boolean;
  onToggleAssist: () => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onOpenHistory?: () => void;
};

export function Topbar({
  assistOpen,
  onToggleAssist,
  sidebarCollapsed = false,
  onToggleSidebar,
}: TopbarProps) {
  const {
    activeWorkspace,
    updateWorkspace,
    setError,
    t,
    savedLayouts,
    saveCurrentLayoutAs,
    removeSavedLayout,
    applySavedLayout,
    openNewSpaceFromLayout,
  } = useSpace();
  const { view } = useView();
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(activeWorkspace?.name ?? "");
  const browseFolder = useFolderBrowse();
  const [moreOpen, setMoreOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const showWorkspace = Boolean(activeWorkspace) && !APP_VIEWS.has(view) && !HIDE_TOPBAR_TITLE.has(view);
  const showSpaceCwd = Boolean(activeWorkspace) && view === "space";
  const showMeta = showWorkspace && view !== "space";
  const showAppTitle = !showWorkspace && !HIDE_TOPBAR_TITLE.has(view);
  const canSaveLayout = view === "space" && Boolean(activeWorkspace);

  useEffect(() => {
    setNameDraft(activeWorkspace?.name ?? "");
    setEditing(false);
  }, [activeWorkspace?.id, activeWorkspace?.name]);

  useEffect(() => {
    if (!moreOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

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

  function closeMore() {
    setMoreOpen(false);
  }

  return (
    <>
      <header className="vs-topbar">
        <div className="vs-topbarLeft" data-no-drag>
          {showSpaceCwd ? (
            <div className="vs-topbarMeta vs-topbarSpaceMeta">
              <button
                type="button"
                className="vs-topbarCwdBtn"
                title={activeWorkspace!.cwd}
                onClick={() => void changeFolder()}
              >
                <Folder size={14} aria-hidden />
                <span className="vs-topbarCwdLabel">{shortPath(activeWorkspace!.cwd)}</span>
              </button>
              {activeWorkspace!.branch ? (
                <span className="vs-badge">{activeWorkspace!.branch}</span>
              ) : null}
            </div>
          ) : showMeta ? (
            <div className="vs-topbarMeta">
              {editing ? (
                <input
                  className="vs-topbarNameInput"
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
                  title={t("topbar.rename")}
                  onClick={() => setEditing(true)}
                >
                  {activeWorkspace!.name}
                </button>
              )}
              {view !== "editor" && <span className="vs-topbarView">{t(TITLE_KEY[view])}</span>}
              {activeWorkspace!.branch && (
                <span className="vs-badge">{activeWorkspace!.branch}</span>
              )}
            </div>
          ) : showAppTitle ? (
            <h1 className="vs-topbarTitle">{t(TITLE_KEY[view])}</h1>
          ) : null}
        </div>
        <div
          className="vs-titleDrag"
          data-tauri-drag-region
          onPointerDown={beginWindowDrag}
          onDoubleClick={toggleMaximize}
        />
        <div className="vs-topbarActions" data-no-drag>
          {onToggleSidebar ? (
            <button
              type="button"
              className="vs-iconBtn"
              title={sidebarCollapsed ? t("shell.expand") : t("shell.collapse")}
              aria-label={sidebarCollapsed ? t("shell.expand") : t("shell.collapse")}
              aria-pressed={!sidebarCollapsed}
              onClick={onToggleSidebar}
            >
              <IconSidebar size={16} />
            </button>
          ) : null}
          <button
            type="button"
            className="vs-iconBtn"
            title={t("assist.toggle")}
            aria-label={t("assist.toggle")}
            aria-pressed={assistOpen}
            onClick={onToggleAssist}
          >
            <IconAssistPanel size={16} aria-hidden />
          </button>
          <div className="vs-chromeWrap" ref={moreRef}>
            <button
              type="button"
              className="vs-iconBtn"
              title={t("layouts.menu")}
              aria-label={t("layouts.menu")}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
            >
              <IconMore size={16} />
            </button>
            {moreOpen ? (
              <div className="vs-chromeFlyout is-menu is-wide is-layouts" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="is-primary"
                  disabled={!canSaveLayout}
                  onClick={() => {
                    closeMore();
                    setSaveOpen(true);
                  }}
                >
                  {t("layouts.saveCurrent")}
                </button>
                {savedLayouts.length ? (
                  <>
                    <div className="vs-chromeMenuSep" role="separator" />
                    <div className="vs-chromeMenuLabel">{t("layouts.saved")}</div>
                    <div className="vs-layoutBuildList">
                      {savedLayouts.map((layout) => (
                        <div key={layout.id} className="vs-layoutBuildRow">
                          <div className="vs-layoutBuildMeta">
                            <strong title={layout.name}>{layout.name}</strong>
                            <span>
                              {t("layouts.paneCount").replace(
                                "{n}",
                                String(savedLayoutPaneCount(layout)),
                              )}
                            </span>
                          </div>
                          <div className="vs-layoutBuildActions">
                            <button
                              type="button"
                              className="is-apply"
                              disabled={!canSaveLayout}
                              onClick={() => {
                                closeMore();
                                void applySavedLayout(layout.id);
                              }}
                            >
                              {t("layouts.applyHere")}
                            </button>
                            <button
                              type="button"
                              className="is-open"
                              onClick={() => {
                                closeMore();
                                void openNewSpaceFromLayout(layout.id);
                              }}
                            >
                              {t("layouts.newSpace")}
                            </button>
                            <button
                              type="button"
                              className="is-danger"
                              title={t("layouts.remove")}
                              aria-label={t("layouts.remove")}
                              onClick={() => removeSavedLayout(layout.id)}
                            >
                              <IconX size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="vs-layoutBuildEmpty">{t("layouts.empty")}</p>
                )}
              </div>
            ) : null}
          </div>
          <WindowControls />
        </div>
      </header>
      <PromptDialog
        open={saveOpen}
        title={t("layouts.saveTitle")}
        label={t("layouts.saveLabel")}
        initialValue={activeWorkspace?.name ?? ""}
        confirmLabel={t("layouts.saveConfirm")}
        cancelLabel={t("layouts.saveCancel")}
        onCancel={() => setSaveOpen(false)}
        onConfirm={(value) => {
          setSaveOpen(false);
          saveCurrentLayoutAs(value);
        }}
      />
    </>
  );
}
