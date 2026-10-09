import { useEffect, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconReopen } from "@/components/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSpace, useView } from "@/features/workspace/SpaceContext";
import type { ViewId } from "@/lib/types";
import type { MsgKey } from "@/i18n";
import { WindowControls } from "@/components/shell/WindowControls";
import { beginWindowDrag, toggleMaximize } from "@/features/ui/windowDrag";
import {
  checkForUpdates,
  openUpdateUrl,
  type UpdateCheckResult,
} from "@/features/updates/api";

const TITLE_KEY: Record<ViewId, MsgKey> = {
  space: "nav.space",
  projects: "nav.projects",
  agents: "nav.agents",
  board: "nav.board",
  history: "nav.history",
  browser: "nav.browser",
  settings: "nav.settings",
};

const APP_VIEWS = new Set<ViewId>(["agents", "history", "projects", "board"]);
const HIDE_TOPBAR_TITLE = new Set<ViewId>(["settings", "space"]);

export function Topbar() {
  const {
    activeWorkspace,
    updateWorkspace,
    t,
    browserFocusMode,
    isVsCodeFocusActive,
    toggleBrowserFocusMode,
    goFocusBack,
    goFocusForward,
    canFocusBack,
    canFocusForward,
    reopenClosed,
    canReopenClosed,
  } = useSpace();
  const { view } = useView();
  const [editing, setEditing] = useState(false);
  const [update, setUpdate] = useState<UpdateCheckResult | null>(null);
  const [nameDraft, setNameDraft] = useState(activeWorkspace?.name ?? "");
  /** Name in chrome only for non-space app views — space name lives in the sidebar. */
  const showWorkspaceName =
    Boolean(activeWorkspace) &&
    !APP_VIEWS.has(view) &&
    !HIDE_TOPBAR_TITLE.has(view) &&
    view !== "space";
  const showAppTitle = !showWorkspaceName && !HIDE_TOPBAR_TITLE.has(view) && view !== "space";
  const showFocusBadge = view === "space" && browserFocusMode;

  useEffect(() => {
    setNameDraft(activeWorkspace?.name ?? "");
    setEditing(false);
  }, [activeWorkspace?.id, activeWorkspace?.name]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkForUpdates()
        .then((result) => setUpdate(result.updateAvailable ? result : null))
        .catch(() => undefined);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onRename = () => {
      if (!activeWorkspace) return;
      setEditing(true);
      setNameDraft(activeWorkspace.name);
    };
    window.addEventListener("voxiva-rename-workspace", onRename);
    return () => window.removeEventListener("voxiva-rename-workspace", onRename);
  }, [activeWorkspace]);

  useEffect(() => {
    const label =
      view === "space" && activeWorkspace
        ? activeWorkspace.name
        : HIDE_TOPBAR_TITLE.has(view)
          ? t("nav.settings")
          : showWorkspaceName
            ? activeWorkspace!.name
            : t(TITLE_KEY[view]);
    void getCurrentWindow()
      .setTitle(label)
      .catch(() => undefined);
  }, [showWorkspaceName, activeWorkspace?.name, view, t, activeWorkspace]);

  async function commitName() {
    if (!activeWorkspace) return;
    const next = nameDraft.trim() || "Space";
    setEditing(false);
    if (next !== activeWorkspace.name) {
      await updateWorkspace(activeWorkspace.id, { name: next });
    }
  }

  return (
    <header className="vs-topbar">
      <div className="vs-topbarLeft" data-no-drag>
        <div className="vs-topbarNav">
          <button
            type="button"
            className="vs-iconBtn"
            title={t("nav.focusBack")}
            aria-label={t("nav.focusBack")}
            disabled={!canFocusBack}
            onClick={() => goFocusBack()}
          >
            <IconChevronLeft size={15} />
          </button>
          <button
            type="button"
            className="vs-iconBtn"
            title={t("nav.focusForward")}
            aria-label={t("nav.focusForward")}
            disabled={!canFocusForward}
            onClick={() => goFocusForward()}
          >
            <IconChevronRight size={15} />
          </button>
          <button
            type="button"
            className="vs-iconBtn"
            title={t("nav.reopenClosed")}
            aria-label={t("nav.reopenClosed")}
            disabled={!canReopenClosed}
            onClick={() => void reopenClosed()}
          >
            <IconReopen size={15} />
          </button>
        </div>
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
                setNameDraft(activeWorkspace?.name ?? "");
                setEditing(false);
              }
            }}
          />
        ) : showWorkspaceName ? (
          <div className="vs-topbarMeta">
            <button
              type="button"
              className="vs-topbarNameBtn"
              title={t("topbar.rename")}
              onClick={() => setEditing(true)}
            >
              {activeWorkspace!.name}
            </button>
            <span className="vs-topbarView">{t(TITLE_KEY[view])}</span>
          </div>
        ) : showFocusBadge ? (
          <div className="vs-topbarMeta">
            <button
              type="button"
              className={`vs-badge${isVsCodeFocusActive ? " is-ok" : ""}`}
              title={t("vscode.focusModeHint")}
              aria-pressed={isVsCodeFocusActive}
              onClick={() => toggleBrowserFocusMode()}
            >
              {t("vscode.focusMode")}
            </button>
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
      {update ? (
        <button
          type="button"
          className="vs-updateNotice"
          data-no-drag
          title={t("settings.updateAvailable")
            .replace("{latest}", update.latestVersion)
            .replace("{current}", update.currentVersion)}
          onClick={() => void openUpdateUrl(update.downloadUrl || update.downloadsPage)}
        >
          <span aria-hidden />
          {t("update.ready").replace("{version}", update.latestVersion)}
        </button>
      ) : null}
      <div className="vs-topbarActions" data-no-drag>
        <WindowControls />
      </div>
    </header>
  );
}
