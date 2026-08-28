import { Plus, TerminalSquare } from "@untitledui/icons";
import { SplitGrid } from "@/features/workspace/SplitGrid";
import { useSpace } from "@/features/workspace/SpaceContext";

export function SpacePage() {
  const { activeWorkspace, t } = useSpace();

  if (!activeWorkspace) {
    return (
      <div className="vs-spaceEmpty">
        <div className="vs-spaceEmptyCard">
          <span className="vs-spaceEmptyMark" aria-hidden>
            <TerminalSquare size={28} strokeWidth={2.1} />
          </span>
          <h2>{t("space.emptyTitle")}</h2>
          <p>{t("space.emptyBody")}</p>
          <button
            type="button"
            className="vs-btn vs-btnPrimary vs-spaceEmptyBtn"
            onClick={() => window.dispatchEvent(new CustomEvent("voxiva-new-space"))}
          >
            <Plus size={16} aria-hidden />
            {t("space.emptyCreate")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="vs-space">
      <div className="vs-spaceStage">
        <SplitGrid layout={activeWorkspace.layout} />
      </div>
    </section>
  );
}
