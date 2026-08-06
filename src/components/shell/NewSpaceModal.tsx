import { useState } from "react";
import {
  CreateSpaceSetup,
  type CreateSpaceSetupValue,
} from "@/components/shell/CreateSpaceSetup";
import { pickWorkspaceFolder } from "@/features/terminal";
import { useSpace } from "@/features/workspace/SpaceContext";
import { clientError } from "@/lib/errors";
import { SPACE_COLORS, type SpaceColor } from "@/lib/types";
import { Folder } from "@untitledui/icons";

type NewSpaceModalProps = {
  open: boolean;
  onClose: () => void;
};

export function NewSpaceModal({ open, onClose }: NewSpaceModalProps) {
  const { workspaces, createWorkspace, setError, t } = useSpace();
  const [name, setName] = useState("");
  const [cwd, setCwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<CreateSpaceSetupValue>(() => {
    const used = new Set(workspaces.map((ws) => ws.color));
    const free =
      SPACE_COLORS.find((c) => !used.has(c)) ?? SPACE_COLORS[workspaces.length % SPACE_COLORS.length];
    return {
      grid: 4,
      agentIds: [],
      includeBrowser: false,
      color: free as SpaceColor,
    };
  });

  if (!open) return null;

  async function browse() {
    try {
      const picked = await pickWorkspaceFolder();
      if (!picked) return;
      setCwd(picked);
      if (!name.trim()) {
        const base = picked.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
        if (base) setName(base);
      }
    } catch (err) {
      setError(clientError(err));
    }
  }

  async function confirm() {
    if (!cwd.trim()) {
      setError(t("projects.needFolder"));
      return;
    }
    setBusy(true);
    try {
      await createWorkspace({
        name: name.trim() || "Space",
        cwd: cwd.trim(),
        grid: setup.grid,
        includeBrowser: setup.includeBrowser,
        color: setup.color,
        agentIds: setup.agentIds,
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
    <div className="vs-modalScrim" role="presentation" onClick={onClose}>
      <div
        className="vs-modal vs-modalNewSpace"
        role="dialog"
        aria-modal="true"
        aria-label={t("projects.setupTitle")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vs-modalHeader">
          <strong>{t("projects.setupTitle")}</strong>
          <button type="button" className="vs-btn vs-btnGhost" onClick={onClose} aria-label="Close">
            ×
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
              onChange={(e) => setCwd(e.target.value)}
              placeholder="D:\\projects\\app"
              spellCheck={false}
            />
            <button type="button" className="vs-modalBrowse" onClick={() => void browse()}>
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
