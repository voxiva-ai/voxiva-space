import { useEffect, useState } from "react";
import {
  CreateSpaceSetup,
  type CreateSpaceSetupValue,
} from "@/components/shell/CreateSpaceSetup";
import { IconX } from "@/components/icons";
import { useFolderBrowse } from "@/features/workspace/useFolderBrowse";
import { useSpace } from "@/features/workspace/SpaceContext";
import { clientError } from "@/lib/errors";
import { SPACE_COLORS, type SpaceColor } from "@/lib/types";
import { Folder } from "@untitledui/icons";

type NewSpaceModalProps = {
  open: boolean;
  onClose: () => void;
};

/** Show/store Windows paths with single backslashes (never `D:\\foo`). */
function normalizeFolderPath(path: string) {
  const trimmed = path.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\//g, "\\").replace(/\\{2,}/g, "\\");
}

function nextColor(used: Set<string>, count: number): SpaceColor {
  return (
    SPACE_COLORS.find((c) => !used.has(c)) ?? SPACE_COLORS[count % SPACE_COLORS.length]
  );
}

export function NewSpaceModal({ open, onClose }: NewSpaceModalProps) {
  const { workspaces, createWorkspace, setError, t } = useSpace();
  const [name, setName] = useState("");
  const [cwd, setCwd] = useState("");
  const [busy, setBusy] = useState(false);
  const browseFolder = useFolderBrowse();
  const [setup, setSetup] = useState<CreateSpaceSetupValue>({
    grid: 2,
    agentIds: [],
    includeBrowser: false,
    color: "green",
  });

  useEffect(() => {
    if (!open) return;
    const used = new Set(workspaces.map((ws) => ws.color));
    setName("");
    setCwd("");
    setBusy(false);
    setSetup({
      grid: 2,
      agentIds: [],
      includeBrowser: false,
      color: nextColor(used, workspaces.length),
    });
    // Only reset when the modal opens — not on every workspaces update (that felt like lag).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function browse() {
    try {
      const picked = await browseFolder(cwd.trim() || null);
      if (!picked) return;
      const folder = normalizeFolderPath(picked);
      setCwd(folder);
      if (!name.trim()) {
        const base = folder.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
        if (base) setName(base);
      }
    } catch (err) {
      setError(clientError(err));
    }
  }

  async function confirm() {
    const folder = normalizeFolderPath(cwd);
    if (!folder) {
      setError(t("projects.needFolder"));
      return;
    }
    setBusy(true);
    try {
      await createWorkspace({
        name: name.trim() || "Space",
        cwd: folder,
        grid: setup.grid,
        includeBrowser: setup.includeBrowser,
        color: setup.color,
        agentIds: [],
      });
      setName("");
      setCwd("");
      onClose();
    } catch (err) {
      setError(clientError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vs-modalScrim vs-modalScrimFast" role="presentation" onClick={onClose}>
      <div
        className="vs-modal vs-modalNewSpace"
        role="dialog"
        aria-modal="true"
        aria-label={t("projects.setupTitle")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vs-modalHeader">
          <strong>{t("projects.setupTitle")}</strong>
          <button
            type="button"
            className="vs-iconBtn"
            onClick={onClose}
            aria-label={t("space.close")}
            title={t("space.close")}
          >
            <IconX size={16} />
          </button>
        </div>

        <div className="vs-modalSection">
          <span className="vs-modalLabel">{t("projects.name")}</span>
          <input
            className="vs-modalInput"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Space"
            autoFocus
          />
        </div>

        <div className="vs-modalSection">
          <span className="vs-modalLabel">{t("projects.folder")}</span>
          <div className="vs-modalPathRow">
            <Folder size={15} aria-hidden />
            <input
              value={cwd}
              onChange={(e) => setCwd(normalizeFolderPath(e.target.value))}
              placeholder="D:/projects/app"
              spellCheck={false}
            />
            <button
              type="button"
              className="vs-modalBrowse"
              onClick={() => void browse()}
            >
              {t("projects.browse")}
            </button>
          </div>
        </div>

        <CreateSpaceSetup
          value={setup}
          onChange={setSetup}
          compact
          showPreview={false}
          showBrowser
          showColor
          showAgents={false}
        />

        <div className="vs-modalActions">
          <button type="button" className="vs-btn" onClick={onClose} disabled={busy}>
            {t("projects.cancel")}
          </button>
          <button
            type="button"
            className="vs-btn vs-btnPrimary"
            disabled={busy || !cwd.trim()}
            onClick={() => void confirm()}
          >
            {t("projects.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
