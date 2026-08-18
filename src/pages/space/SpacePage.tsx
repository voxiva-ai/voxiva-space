import { useEffect, useState } from "react";
import { Plus, TerminalSquare } from "@untitledui/icons";
import { LayoutSnapBar } from "@/features/workspace/LayoutSnapBar";
import { SplitGrid } from "@/features/workspace/SplitGrid";
import { useSpace } from "@/features/workspace/SpaceContext";

export function SpacePage() {
  const { activeWorkspace, isBusy, t } = useSpace();
  const [snapOpen, setSnapOpen] = useState(false);

  useEffect(() => {
    const onDrag = (event: Event) => {
      setSnapOpen(Boolean((event as CustomEvent<{ active?: boolean }>).detail?.active));
    };
    window.addEventListener("voxiva-pane-drag", onDrag);
    return () => window.removeEventListener("voxiva-pane-drag", onDrag);
  }, []);

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
    <section className={`vs-space${snapOpen ? " is-snapping" : ""}`}>
      {snapOpen ? <LayoutSnapBar floating disabled={isBusy} /> : null}
      <div className="vs-spaceStage">
        <SplitGrid layout={activeWorkspace.layout} />
      </div>
    </section>
  );
}
