import { useEffect, useMemo, useState } from "react";
import logoUrl from "@/assets/brand/voxiva-space-mark.svg";
import { LiveGridPreview } from "@/components/shell/LiveGridPreview";
import { WindowControls } from "@/components/shell/WindowControls";
import { beginWindowDrag, toggleMaximize } from "@/features/ui/windowDrag";
import { getDefaultTerminalCwd } from "@/features/terminal";
import { useFolderBrowse } from "@/features/workspace/useFolderBrowse";
import type { GridPreset } from "@/features/workspace/layout";
import { useSpace } from "@/features/workspace/SpaceContext";
import type { MsgKey } from "@/i18n";

const LAYOUTS: Array<{ id: GridPreset; cells: number; labelKey: MsgKey; hintKey: MsgKey }> = [
  { id: 1, cells: 1, labelKey: "welcome.single", hintKey: "welcome.singleHint" },
  { id: 2, cells: 2, labelKey: "welcome.split", hintKey: "welcome.splitHint" },
  { id: 4, cells: 4, labelKey: "welcome.quad", hintKey: "welcome.quadHint" },
  { id: 8, cells: 8, labelKey: "welcome.oct", hintKey: "welcome.octHint" },
];

export function WelcomePage() {
  const {
    enterSpace,
    dismissWelcome,
    isBusy,
    error,
    setError,
    workspaces,
    activeWorkspace,
    t,
  } = useSpace();
  const hasSpaces = workspaces.length > 0;
  const last = activeWorkspace ?? workspaces[0] ?? null;
  const defaultName = t("welcome.defaultName");
  const [name, setName] = useState(defaultName);
  const [cwd, setCwd] = useState(last?.cwd || "");
  const [grid, setGrid] = useState<GridPreset>(2);
  const [showCreate, setShowCreate] = useState(!hasSpaces);
  const browseFolder = useFolderBrowse();

  const existingLabel = useMemo(
    () => t("welcome.existingCount").replace("{n}", String(workspaces.length)),
    [t, workspaces.length],
  );

  useEffect(() => {
    if (cwd.trim()) return;
    void getDefaultTerminalCwd()
      .then((home) => setCwd(home.trim() || ""))
      .catch(() => undefined);
  }, [cwd]);

  async function browseFolderClick() {
    try {
      const picked = await browseFolder(cwd.trim() || null);
      if (picked) {
        setCwd(picked);
        const base = picked.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
        if (base && (!name.trim() || name === defaultName)) setName(base);
      }
    } catch {
      // cancelled
    }
  }

  return (
    <div className="vs-welcome">
      <div className="vs-welcomeChrome">
        <div
          className="vs-titleDrag"
          data-tauri-drag-region
          onPointerDown={beginWindowDrag}
          onDoubleClick={toggleMaximize}
        />
        <div className="vs-welcomeWin">
          <WindowControls />
        </div>
      </div>

      <div className="vs-welcomeStage">
        <div className="vs-welcomeCopy">
          <img src={logoUrl} alt="" className="vs-welcomeLogo" />
          <p className="vs-welcomeKicker">{t("brand.sub")}</p>
          <h1 className="vs-welcomeBrand">
            Voxiva <span>Space</span>
          </h1>
          <p className="vs-welcomeLead">
            {hasSpaces ? t("welcome.leadReturn") : t("welcome.lead")}
          </p>

          {hasSpaces && !showCreate ? (
            <div className="vs-welcomeForm">
              <p className="vs-welcomeExisting">{existingLabel}</p>
              {last ? (
                <p className="vs-welcomeExisting is-strong">
                  {last.name}
                  {last.cwd ? ` · ${last.cwd}` : ""}
                </p>
              ) : null}
              <button
                type="button"
                className="vs-btn vs-btnPrimary vs-welcomeCta"
                onClick={() => dismissWelcome()}
              >
                {t("welcome.continue")}
              </button>
              <button
                type="button"
                className="vs-btn vs-welcomeSecondary"
                onClick={() => setShowCreate(true)}
              >
                {t("welcome.addSpace")}
              </button>
            </div>
          ) : (
            <div className={`vs-welcomeForm${hasSpaces ? " is-add" : ""}`}>
              {hasSpaces ? (
                <>
                  <div className="vs-welcomeDivider">{t("welcome.orCreate")}</div>
                  <button
                    type="button"
                    className="vs-btn vs-btnGhost vs-welcomeBack"
                    onClick={() => setShowCreate(false)}
                  >
                    ← {t("welcome.continue")}
                  </button>
                </>
              ) : null}

              <label className="vs-field">
                <span>{t("welcome.name")}</span>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>

              <label className="vs-field">
                <span>{t("welcome.folder")}</span>
                <div className="vs-welcomePathRow">
                  <input value={cwd} onChange={(e) => setCwd(e.target.value)} spellCheck={false} />
                  <button
                    type="button"
                    className="vs-btn"
                    onClick={() => void browseFolderClick()}
                  >
                    {t("welcome.browse")}
                  </button>
                </div>
              </label>

              <div className="vs-welcomeLayouts">
                <span className="vs-kicker">{t("welcome.template")}</span>
                <div className="vs-welcomeLayoutGrid">
                  {LAYOUTS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`vs-layoutCard${grid === item.id ? " is-active" : ""}`}
                      onClick={() => setGrid(item.id)}
                    >
                      <div
                        className={`vs-layoutPreview is-${item.cells}${item.id === 4 ? " has-browserCol" : ""}${item.id === 8 ? " has-browserCell" : ""}`}
                        aria-hidden
                      >
                        {Array.from({ length: item.cells }).map((_, i) => (
                          <span key={i} />
                        ))}
                      </div>
                      <strong>{t(item.labelKey)}</strong>
                      <small>{t(item.hintKey)}</small>
                    </button>
                  ))}
                </div>
              </div>

              {error ? (
                <div className="vs-error">
                  {error}
                  <button type="button" className="vs-btn vs-btnGhost" onClick={() => setError("")}>
                    {t("toast.ok")}
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                className="vs-btn vs-btnPrimary vs-welcomeCta"
                disabled={isBusy}
                onClick={() => void enterSpace({ name, cwd, grid })}
              >
                {isBusy ? t("welcome.busy") : hasSpaces ? t("welcome.addSpace") : t("welcome.enter")}
              </button>
              <p className="vs-welcomeNote">{t("welcome.note")}</p>
            </div>
          )}
        </div>

        <div className="vs-welcomePreviewSlot">
          <LiveGridPreview panes={grid} />
        </div>
      </div>
    </div>
  );
}
