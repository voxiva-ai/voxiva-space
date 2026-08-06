import { useEffect, useState } from "react";
import logoUrl from "@/assets/brand/voxiva-space-mark.svg";
import { LiveGridPreview } from "@/components/shell/LiveGridPreview";
import { getDefaultTerminalCwd, pickWorkspaceFolder } from "@/features/terminal";
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
    isBusy,
    error,
    setError,
    workspaces,
    activeWorkspace,
    t,
  } = useSpace();
  const last = activeWorkspace ?? workspaces[0] ?? null;
  const [name, setName] = useState(last?.name || "My Space");
  const [cwd, setCwd] = useState(last?.cwd || "");
  const [grid, setGrid] = useState<GridPreset>(2);

  useEffect(() => {
    if (cwd.trim()) return;
    void getDefaultTerminalCwd()
      .then((home) => setCwd(home.trim() || ""))
      .catch(() => undefined);
  }, [cwd]);

  return (
    <div className="vs-welcome">
      <div className="vs-welcomeStage">
        <div className="vs-welcomeCopy">
          <img src={logoUrl} alt="" className="vs-welcomeLogo" />
          <h1 className="vs-welcomeBrand">
            Voxiva <span>Space</span>
          </h1>
          <p className="vs-welcomeLead">{t("welcome.lead")}</p>

          <div className="vs-welcomeForm">
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
                  onClick={() =>
                    void (async () => {
                      try {
                        const picked = await pickWorkspaceFolder();
                        if (picked) {
                          setCwd(picked);
                          const base = picked.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
                          if (base && (!name.trim() || name === "My Space")) setName(base);
                        }
                      } catch {
                        // cancelled
                      }
                    })()
                  }
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
                    <div className={`vs-layoutPreview is-${item.cells}`} aria-hidden>
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

            {error && (
              <div className="vs-error">
                {error}
                <button type="button" className="vs-btn vs-btnGhost" onClick={() => setError("")}>
                  {t("toast.ok")}
                </button>
              </div>
            )}

            <button
              type="button"
              className="vs-btn vs-btnPrimary vs-welcomeCta"
              disabled={isBusy}
              onClick={() => void enterSpace({ name, cwd, grid })}
            >
              {isBusy ? t("welcome.busy") : t("welcome.enter")}
            </button>
          </div>
        </div>

        <LiveGridPreview panes={grid} />
      </div>
    </div>
  );
}
