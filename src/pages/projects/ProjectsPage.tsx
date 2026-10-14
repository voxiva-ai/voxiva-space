import { type CSSProperties, type MouseEvent, useMemo, useState } from "react";
import { FolderOpen, FolderPlus, MoreHorizontal, Search } from "lucide-react";
import {
  CreateSpaceSetup,
  type CreateSpaceSetupValue,
} from "@/components/shell/CreateSpaceSetup";
import { ConfirmDialog } from "@/components/PromptDialog";
import { IconX } from "@/components/icons";
import { openInExplorer, pickWorkspaceFolder } from "@/features/terminal";
import { collectLeaves, collectSessionIds, countLeaves, leafHasBrowser } from "@/features/workspace/layout";
import { useSpace } from "@/features/workspace/SpaceContext";
import { clientError } from "@/lib/errors";
import { SPACE_COLOR_HEX, type Workspace } from "@/lib/types";

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
    sessions,
    setError,
    t,
  } = useSpace();
  const [name, setName] = useState("");
  const [cwd, setCwd] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Workspace | null>(null);
  const [setup, setSetup] = useState<CreateSpaceSetupValue>({
    grid: 2,
    agentIds: [],
    includeBrowser: false,
    color: "green",
  });
  const [query, setQuery] = useState("");
  const visibleWorkspaces = useMemo(() => {
    const filter = query.trim().toLocaleLowerCase();
    if (!filter) return workspaces;
    return workspaces.filter((ws) => `${ws.name} ${ws.cwd} ${ws.branch ?? ""}`.toLocaleLowerCase().includes(filter));
  }, [query, workspaces]);

  function closeProjectMenu(event: MouseEvent<HTMLButtonElement>, run: () => void) {
    const menu = event.currentTarget.closest("details");
    if (menu instanceof HTMLDetailsElement) menu.open = false;
    run();
  }

  async function browseFolder(apply: (path: string) => void) {
    try {
      const picked = await pickWorkspaceFolder();
      if (picked) apply(picked);
    } catch (err) {
      setError(clientError(err));
    }
  }

  function openCreateModal() {
    setName("");
    setCwd("");
    setSetup({
      grid: 2,
      agentIds: [],
      includeBrowser: false,
      color: "default",
    });
    setModalOpen(true);
  }

  async function confirmCreate() {
    if (creating) return;
    setCreating(true);
    try {
      await createWorkspace({
        name: name.trim() || t("welcome.defaultName"),
        cwd: cwd.trim(),
        grid: setup.grid,
        includeBrowser: setup.includeBrowser,
        color: setup.color,
        agentIds: setup.agentIds,
      });
      setModalOpen(false);
    } catch (err) {
      setError(clientError(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="vs-page vs-pageNarrow vs-projectsPage">
      <div className="vs-pageHeader">
        <h2>{t("projects.title")}</h2>
        <p>{t("projects.lead")}</p>
      </div>

      <div className="vs-projectToolbar">
        <label className="vs-projectSearch"><Search size={15} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("projects.search")} aria-label={t("projects.search")} /><span>{visibleWorkspaces.length} / {workspaces.length}</span></label>
        <button type="button" className="vs-btn vs-btnPrimary" onClick={openCreateModal}><FolderPlus size={15} aria-hidden="true" />{t("projects.add")}</button>
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
              <button
                type="button"
                className="vs-iconBtn vs-closeIconButton"
                onClick={() => setModalOpen(false)}
                aria-label={t("space.close")}
                title={t("space.close")}
              >
                <IconX size={16} />
              </button>
            </div>
            <p className="vs-modalLead">{t("projects.setupLead")}</p>

            <div className="vs-projectCreateFields">
              <label className="vs-field"><span>{t("projects.name")}</span><input value={name} onChange={(event) => setName(event.target.value)} autoFocus /></label>
              <label className="vs-field"><span>{t("projects.folder")}</span><span className="vs-projectFolderField"><input value={cwd} onChange={(event) => setCwd(event.target.value)} placeholder={t("projects.folderOptional")} spellCheck={false} /><button type="button" className="vs-btn" onClick={() => void browseFolder((picked) => { setCwd(picked); if (!name.trim()) setName(picked.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || ""); })}><FolderOpen size={14} aria-hidden="true" />{t("projects.browse")}</button></span></label>
            </div>

            <CreateSpaceSetup value={setup} onChange={setSetup} />

            <div className="vs-modalActions">
              <button type="button" className="vs-btn" onClick={() => setModalOpen(false)}>
                {t("projects.cancel")}
              </button>
              <button type="button" className="vs-btn vs-btnPrimary" disabled={creating} onClick={() => void confirmCreate()}>
                {t("projects.create")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="vs-projectList" aria-live="polite">
        {visibleWorkspaces.map((ws) => {
          const liveSessions = collectSessionIds(ws.layout).filter((id) => sessions[id]?.status === "online").length;
          return <article className={`vs-projectRow${activeWorkspace?.id === ws.id ? " is-active" : ""}`} key={ws.id}>
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
                  <span
                    className={`vs-projectRail${ws.color !== "default" ? " is-on" : ""}`}
                    style={
                      ws.color !== "default" && ws.color in SPACE_COLOR_HEX
                        ? ({ ["--vs-ws-rail"]: SPACE_COLOR_HEX[ws.color as keyof typeof SPACE_COLOR_HEX] } as CSSProperties)
                        : undefined
                    }
                    aria-hidden
                  />
                  {ws.name}
                  {activeWorkspace?.id === ws.id ? (
                    <span className="vs-badge">{t("projects.active")}</span>
                  ) : null}
                </strong>
              )}
              <span className="vs-projectPath" title={ws.cwd}>{ws.cwd || t("spaces.noFolder")}</span>
              <span className="vs-projectMeta">
                {ws.branch ? <><span className="vs-projectBranch"><i aria-hidden="true" />{ws.branch}</span><span className="vs-projectMetaDivider" aria-hidden="true">·</span></> : null}
                <span>{t("projects.sessions").replace("{n}", String(liveSessions))}</span>
              </span>
            </div>
            <div className="vs-projectActions">
              <button type="button" className="vs-btn vs-btnPrimary" onClick={() => selectWorkspace(ws.id)}>{t("projects.open")}</button>
              <details className="vs-projectMenu">
                <summary aria-label={t("projects.moreActions")} title={t("projects.moreActions")}><MoreHorizontal size={16} aria-hidden="true" /></summary>
                <div className="vs-projectMenuPanel" role="menu">
                  <button type="button" role="menuitem" onClick={(event) => closeProjectMenu(event, () => {
                  setRenamingId(ws.id);
                  setRenameDraft(ws.name);
                  })}>{t("projects.rename")}</button>
                  <button type="button" role="menuitem" onClick={(event) => closeProjectMenu(event, () => void browseFolder((picked) => { void updateWorkspace(ws.id, { cwd: picked }); }))}>{t("projects.changeFolder")}</button>
                  <button type="button" role="menuitem" onClick={(event) => closeProjectMenu(event, () => void refreshBranch(ws.id))}>{t("projects.refreshGit")}</button>
                  <button type="button" role="menuitem" disabled={!ws.cwd} onClick={(event) => closeProjectMenu(event, () => void openInExplorer(ws.cwd).catch((err) => setError(clientError(err))))}>{t("projects.openFolder")}</button>
                  <button type="button" className="is-danger" role="menuitem" onClick={(event) => closeProjectMenu(event, () => setPendingDelete(ws))}>{t("projects.remove")}</button>
                </div>
              </details>
            </div>
          </article>;
        })}
        {!visibleWorkspaces.length && <div className="vs-projectEmpty"><FolderOpen size={20} aria-hidden="true" /><strong>{workspaces.length ? t("projects.noMatches") : t("projects.empty")}</strong><span>{workspaces.length ? t("projects.searchHint") : t("projects.emptyHint")}</span></div>}
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
