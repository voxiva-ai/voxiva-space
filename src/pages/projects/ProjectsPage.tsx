import { useState } from "react";
import {
  CreateSpaceSetup,
  type CreateSpaceSetupValue,
} from "@/components/shell/CreateSpaceSetup";
import { ConfirmDialog } from "@/components/PromptDialog";
import { openInExplorer, pickWorkspaceFolder } from "@/features/terminal";
import { collectLeaves, collectSessionIds, countLeaves, leafHasBrowser } from "@/features/workspace/layout";
import { useSpace } from "@/features/workspace/SpaceContext";
import { clientError } from "@/lib/errors";
import { SPACE_COLORS, type SpaceColor, type Workspace } from "@/lib/types";
import { TerminalSquare } from "@untitledui/icons";

function workspaceHasContent(ws: Workspace) {
  if (collectSessionIds(ws.layout).length > 0) return true;
  if (countLeaves(ws.layout) > 1) return true;
  return collectLeaves(ws.layout).some((leaf) => leafHasBrowser(leaf));
}

export function ProjectsPage() {
  const {
    workspaces,
    activeWorkspace,
    createWorkspace,
    updateWorkspace,
    removeWorkspace,
    refreshBranch,
    selectWorkspace,
    setError,
    t,
  } = useSpace();
  const [name, setName] = useState("");
  const [cwd, setCwd] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Workspace | null>(null);
  const [setup, setSetup] = useState<CreateSpaceSetupValue>({
    grid: 2,
    agentIds: [],
    includeBrowser: false,
    color: "green",
  });

  async function browseFolder(apply: (path: string) => void) {
    try {
      const picked = await pickWorkspaceFolder();
      if (picked) apply(picked);
    } catch (err) {
      setError(clientError(err));
    }
  }

  function openCreateModal() {
    if (!cwd.trim()) {
      setError(t("projects.needFolder"));
      return;
    }
    const used = new Set(workspaces.map((ws) => ws.color));
    const free =
      SPACE_COLORS.find((c) => !used.has(c)) ?? SPACE_COLORS[workspaces.length % SPACE_COLORS.length];
    setSetup({
      grid: 2,
      agentIds: [],
      includeBrowser: false,
      color: free as SpaceColor,
    });
    setModalOpen(true);
  }

  async function confirmCreate() {
    await createWorkspace({
      name: name || "Space",
      cwd: cwd.trim(),
      grid: setup.grid,
      includeBrowser: setup.includeBrowser,
      color: setup.color,
      agentIds: setup.agentIds,
    });
    setName("");
    setCwd("");
    setModalOpen(false);
  }

  return (
    <div className="vs-page vs-pageNarrow">
      <div className="vs-pageHeader">
        <div className="vs-kicker">{t("projects.title")}</div>
        <h2>{t("projects.title")}</h2>
        <p>{t("projects.lead")}</p>
      </div>

      <div className="vs-formRow">
        <label className="vs-field">
          <span>{t("projects.name")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Frontend" />
        </label>
        <label className="vs-field">
          <span>{t("projects.folder")}</span>
          <input
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            placeholder="D:\\projects\\app"
            spellCheck={false}
          />
        </label>
        <div className="vs-formActions">
          <button
            type="button"
            className="vs-btn"
            onClick={() =>
              void browseFolder((picked) => {
                setCwd(picked);
                if (!name.trim()) {
                  const base = picked.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
                  if (base) setName(base);
                }
              })
            }
          >
            {t("projects.browse")}
          </button>
          <button
            type="button"
            className="vs-btn vs-btnPrimary"
            disabled={!cwd.trim()}
            onClick={openCreateModal}
          >
            {t("projects.add")}
          </button>
        </div>
      </div>

      {modalOpen && (
        <div className="vs-modalScrim" role="presentation" onClick={() => setModalOpen(false)}>
          <div
            className="vs-modal vs-modalWide"
            role="dialog"
            aria-modal="true"
            aria-label={t("projects.setupTitle")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="vs-modalHeader">
              <strong>{t("projects.setupTitle")}</strong>
              <button type="button" className="vs-btn vs-btnGhost" onClick={() => setModalOpen(false)}>
                ×
              </button>
            </div>
            <p className="vs-modalLead">{t("projects.setupLead")}</p>

            <CreateSpaceSetup value={setup} onChange={setSetup} />

            <div className="vs-modalActions">
              <button type="button" className="vs-btn" onClick={() => setModalOpen(false)}>
                {t("projects.cancel")}
              </button>
              <button type="button" className="vs-btn vs-btnPrimary" onClick={() => void confirmCreate()}>
                {t("projects.create")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="vs-projectList">
        {workspaces.map((ws) => (
          <div className="vs-projectRow" key={ws.id}>
            <div>
              {renamingId === ws.id ? (
                <input
                  className="vs-inlineRename"
                  value={renameDraft}
                  autoFocus
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={() => {
                    const next = renameDraft.trim();
                    setRenamingId(null);
                    if (next && next !== ws.name) void updateWorkspace(ws.id, { name: next });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                />
              ) : (
                <strong>
                  <span className={`vs-wsAvatar is-${ws.color}`} aria-hidden>
                    <TerminalSquare size={22} strokeWidth={2.35} />
                  </span>
                  {ws.name}
                  {activeWorkspace?.id === ws.id ? (
                    <span className="vs-badge">{t("projects.active")}</span>
                  ) : null}
                </strong>
              )}
              <span>{ws.cwd}</span>
              <span className="vs-projectMeta">
                {ws.branch
                  ? `${t("projects.branch")}: ${ws.branch}`
                  : t("projects.noGit")}
              </span>
            </div>
            <div className="vs-projectActions">
              <button type="button" className="vs-btn vs-btnPrimary" onClick={() => selectWorkspace(ws.id)}>
                {t("projects.open")}
              </button>
              <button
                type="button"
                className="vs-btn"
                onClick={() => {
                  setRenamingId(ws.id);
                  setRenameDraft(ws.name);
                }}
              >
                {t("projects.rename")}
              </button>
              <button
                type="button"
                className="vs-btn"
                onClick={() =>
                  void browseFolder((picked) => {
                    void updateWorkspace(ws.id, { cwd: picked });
                  })
                }
              >
                {t("projects.changeFolder")}
              </button>
              <button type="button" className="vs-btn" onClick={() => void refreshBranch(ws.id)}>
                {t("projects.refreshGit")}
              </button>
              {!ws.branch && (
                <button
                  type="button"
                  className="vs-btn"
                  title={t("projects.bindGitHint")}
                  onClick={() =>
                    void browseFolder((picked) => {
                      void updateWorkspace(ws.id, { cwd: picked });
                    })
                  }
                >
                  {t("projects.bindGit")}
                </button>
              )}
              <button
                type="button"
                className="vs-btn"
                onClick={() => void openInExplorer(ws.cwd).catch((err) => setError(clientError(err)))}
              >
                {t("projects.openFolder")}
              </button>
              <button type="button" className="vs-btn vs-btnGhost" onClick={() => setPendingDelete(ws)}>
                {t("projects.remove")}
              </button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        danger
        title={t("space.settings.deleteTitle")}
        body={
          pendingDelete
            ? (workspaceHasContent(pendingDelete)
                ? t("space.settings.deleteBodyBusy")
                : t("space.settings.deleteBody")
              ).replace("{name}", pendingDelete.name)
            : ""
        }
        confirmLabel={t("space.settings.deleteConfirm")}
        cancelLabel={t("projects.cancel")}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const id = pendingDelete?.id;
          setPendingDelete(null);
          if (id) void removeWorkspace(id);
        }}
      />
    </div>
  );
}
