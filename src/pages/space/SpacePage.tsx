import { useEffect, useState } from "react";
import { IconBrowser, IconConsole } from "@/components/icons";
import { LayoutSnapBar } from "@/features/workspace/LayoutSnapBar";
import { SplitGrid } from "@/features/workspace/SplitGrid";
import { useSpace } from "@/features/workspace/SpaceContext";
import type { SplitDirection } from "@/lib/types";

export function SpacePage() {
  const {
    activeWorkspace,
    isBusy,
    splitFocused,
    openBrowserInFocused,
    sessions,
    t,
  } = useSpace();
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
      <div className="vs-empty">
        <h2>{t("space.emptyTitle")}</h2>
        <p>{t("space.emptyBody")}</p>
        <button
          type="button"
          className="vs-btn vs-btnPrimary"
          onClick={() => window.dispatchEvent(new CustomEvent("voxiva-new-space"))}
        >
          {t("space.openProjects")}
        </button>
      </div>
    );
  }

  const liveCount = Object.values(sessions).filter((s) => s.status === "online").length;

  function addConsole() {
    const paneId = activeWorkspace?.focusedPaneId;
    const el = paneId
      ? (document.querySelector(`[data-pane-id="${paneId}"]`) as HTMLElement | null)
      : null;
    const rect = el?.getBoundingClientRect();
    const direction: SplitDirection = rect && rect.height > rect.width * 1.15 ? "v" : "h";
    void splitFocused(direction);
  }

  return (
    <section className={`vs-space${snapOpen ? " is-snapping" : ""}`}>
      <div className="vs-spaceToolbar">
        <button
          type="button"
          className="vs-btn vs-spaceIconBtn"
          disabled={isBusy}
          title={t("space.addPane")}
          aria-label={t("space.addPane")}
          onClick={addConsole}
        >
          <IconConsole size={15} />
        </button>
        <button
          type="button"
          className="vs-btn vs-spaceIconBtn"
          disabled={isBusy}
          title={t("space.browser")}
          aria-label={t("space.browser")}
          onClick={() => void openBrowserInFocused()}
        >
          <IconBrowser size={15} />
        </button>
        <span className="vs-toolbarHint">
          {liveCount} {t("space.hint")}
        </span>
      </div>
      {snapOpen ? <LayoutSnapBar floating disabled={isBusy} /> : null}
      <div className="vs-spaceStage">
        <SplitGrid layout={activeWorkspace.layout} />
      </div>
    </section>
  );
}
