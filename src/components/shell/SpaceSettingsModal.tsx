import { useEffect, useMemo, useState } from "react";
import { Folder, Trash01, TerminalSquare, Pin01 } from "@untitledui/icons";
import { IconX } from "@/components/icons";
import { ConfirmDialog } from "@/components/PromptDialog";
import { useFolderBrowse } from "@/features/workspace/useFolderBrowse";
import { collectLeaves, collectSessionIds, countLeaves, leafHasBrowser } from "@/features/workspace/layout";
import { useSpace } from "@/features/workspace/SpaceContext";
import { clientError } from "@/lib/errors";
import { SPACE_COLORS, type SpaceColor, type Workspace } from "@/lib/types";

type SpaceSettingsModalProps = {
  workspaceId: string | null;
  onClose: () => void;
};

function workspaceHasContent(ws: Workspace) {
  if (collectSessionIds(ws.layout).length > 0) return true;
  if (countLeaves(ws.layout) > 1) return true;
  return collectLeaves(ws.layout).some((leaf) => leafHasBrowser(leaf));
}

export function SpaceSettingsModal({ workspaceId, onClose }: SpaceSettingsModalProps) {
  const { workspaces, updateWorkspace, removeWorkspace, toggleWorkspacePinned, sessions, setError, t } =
    useSpace();
  const workspace = workspaces.find((ws) => ws.id === workspaceId) ?? null;

  const [name, setName] = useState("");
  const [cwd, setCwd] = useState("");
  const [color, setColor] = useState<SpaceColor>("green");
  const [busy, setBusy] = useState(false);
  const browseFolder = useFolderBrowse();
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!workspace) return;
    setName(workspace.name);
    setCwd(workspace.cwd);
    setColor(workspace.color);
    setConfirmDelete(false);
  }, [workspace]);

  useEffect(() => {
    if (!workspaceId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !confirmDelete) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [workspaceId, onClose, confirmDelete]);

  const hasContent = useMemo(() => {
    if (!workspace) return false;
    if (workspaceHasContent(workspace)) return true;
    // Live sessions may exist even if layout ids were cleared oddly.
    const ids = collectSessionIds(workspace.layout);
    return ids.some((id) => sessions[id]?.status === "online");
  }, [workspace, sessions]);

  if (!workspaceId || !workspace) return null;

  const ws = workspace;

  async function browse() {
    try {
      const picked = await browseFolder(cwd.trim() || null);
      if (picked) setCwd(picked);
    } catch (err) {
      setError(clientError(err));
    }
  }

  async function save() {
    if (!cwd.trim()) {
      setError(t("projects.needFolder"));
      return;
    }
    setBusy(true);
    try {
      await updateWorkspace(ws.id, {
        name: name.trim() || "Space",
        cwd: cwd.trim(),
        color,
      });
      onClose();
    } catch (err) {
      setError(clientError(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove() {
    setBusy(true);
    try {
      await removeWorkspace(ws.id);
      setConfirmDelete(false);
      onClose();
    } catch (err) {
      setError(clientError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="vs-modalScrim vs-modalScrimFast" role="presentation" onClick={onClose}>
        <div
          className="vs-modal vs-spaceSettingsModal"
          role="dialog"
          aria-modal="true"
          aria-label={t("space.settings.title")}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="vs-ssHead">
            <span className={`vs-ssMark is-${color}`} aria-hidden>
              <TerminalSquare size={22} strokeWidth={2.2} />
            </span>
            <div className="vs-ssHeadCopy">
              <strong>{t("space.settings.title")}</strong>
              <p>{t("space.settings.lead")}</p>
            </div>
            <button type="button" className="vs-iconBtn" aria-label={t("space.close")} onClick={onClose}>
              <IconX size={16} />
            </button>
          </header>

          <div className="vs-ssBody">
            <label className="vs-ssField">
              <span>{t("projects.name")}</span>
              <input
                className="vs-modalInput"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </label>

            <label className="vs-ssField">
              <span>{t("projects.folder")}</span>
              <div className="vs-modalPathRow">
                <Folder size={15} aria-hidden />
                <input value={cwd} onChange={(e) => setCwd(e.target.value)} spellCheck={false} />
                <button
                  type="button"
                  className="vs-modalBrowse"
                  onClick={() => void browse()}
                >
                  {t("projects.browse")}
                </button>
              </div>
            </label>

            <div className="vs-ssField">
              <span>{t("projects.color")}</span>
              <div className="vs-ssColors" role="radiogroup" aria-label={t("projects.color")}>
                {SPACE_COLORS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="radio"
                    aria-checked={color === item}
                    className={`vs-ssColor is-${item}${color === item ? " is-active" : ""}`}
                    aria-label={item}
                    onClick={() => setColor(item)}
                  />
                ))}
              </div>
            </div>

            <div className="vs-ssField">
              <span>{t("spaces.pin")}</span>
              <button
                type="button"
                className={`vs-btn vs-ssPinBtn${ws.pinned ? " is-on" : ""}`}
                aria-pressed={Boolean(ws.pinned)}
                onClick={() => toggleWorkspacePinned(ws.id)}
              >
                <Pin01 size={15} aria-hidden />
                {ws.pinned ? t("spaces.unpin") : t("spaces.pin")}
              </button>
            </div>
          </div>

          <footer className="vs-ssFoot">
            <button
              type="button"
              className="vs-btn vs-btnDanger vs-ssDelete"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash01 size={14} aria-hidden />
              {t("space.settings.delete")}
            </button>
            <span className="vs-ssFootSpacer" />
            <button type="button" className="vs-btn vs-btnGhost" onClick={onClose}>
              {t("projects.cancel")}
            </button>
            <button type="button" className="vs-btn vs-btnPrimary" disabled={busy} onClick={() => void save()}>
              {t("projects.save")}
            </button>
          </footer>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        danger
        title={t("space.settings.deleteTitle")}
        body={
          hasContent
            ? t("space.settings.deleteBodyBusy").replace("{name}", ws.name)
            : t("space.settings.deleteBody").replace("{name}", ws.name)
        }
        confirmLabel={t("space.settings.deleteConfirm")}
        cancelLabel={t("projects.cancel")}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void confirmRemove()}
      />
    </>
  );
}
