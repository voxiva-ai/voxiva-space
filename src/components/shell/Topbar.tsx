import { useEffect, useState } from "react";
import { LayoutRight } from "@untitledui/icons";
import { openInExplorer } from "@/features/terminal";
import { useSpace } from "@/features/workspace/SpaceContext";
import type { ViewId } from "@/lib/types";
import type { MsgKey } from "@/i18n";
import { clientError } from "@/lib/errors";

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
const APP_VIEWS = new Set<ViewId>(["settings", "agents", "history", "projects", "board"]);

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
  const { view, activeWorkspace, updateWorkspace, setError, t } = useSpace();
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(activeWorkspace?.name ?? "");
  const showWorkspace = Boolean(activeWorkspace) && !APP_VIEWS.has(view);

  useEffect(() => {
    setNameDraft(activeWorkspace?.name ?? "");
    setEditing(false);
  }, [activeWorkspace?.id, activeWorkspace?.name]);

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
      <div className="vs-topbarLeft">
        {sidebarCollapsed && onExpandSidebar ? (
          <button
            type="button"
            className="vs-iconBtn vs-topbarExpand"
            title={t("shell.expand")}
            aria-label={t("shell.expand")}
            onClick={onExpandSidebar}
          >
            <LayoutRight size={16} aria-hidden />
          </button>
        ) : null}
        {showWorkspace ? (
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
            {view !== "space" && view !== "editor" && (
              <span className="vs-topbarView">{t(TITLE_KEY[view])}</span>
            )}
            {activeWorkspace!.branch && <span className="vs-badge">{activeWorkspace!.branch}</span>}
            {(view === "space" || view === "editor") && (
              <button
                type="button"
                className="vs-path"
                title={t("projects.openFolder")}
                onClick={() => {
                  void openInExplorer(activeWorkspace!.cwd).catch((err) =>
                    setError(clientError(err)),
                  );
                }}
              >
                {activeWorkspace!.cwd}
              </button>
            )}
          </div>
        ) : (
          <h1 className="vs-topbarTitle">{t(TITLE_KEY[view])}</h1>
        )}
      </div>
      <div className="vs-topbarActions">
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
      </div>
    </header>
  );
}
