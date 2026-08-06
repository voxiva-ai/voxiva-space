import { useEffect, useRef, type CSSProperties } from "react";
import type { SplitNode, TerminalSession } from "@/lib/types";
import type { SnapLayoutId } from "@/features/workspace/layout";
import { TerminalPane } from "@/features/terminal";
import { enqueueTerminalSpawn, yieldToUi } from "@/features/terminal/spawnQueue";
import { NativeBrowser } from "@/features/browser/NativeBrowser";
import { useSpace } from "@/features/workspace/SpaceContext";

function emitPaneDrag(active: boolean) {
  window.dispatchEvent(new CustomEvent("voxiva-pane-drag", { detail: { active } }));
}

function PaneLeaf({
  paneId,
  kind,
  sessionId,
  browserUrl,
}: {
  paneId: string;
  kind: "terminal" | "browser";
  sessionId: string | null;
  browserUrl: string | null;
}) {
  const {
    activeWorkspace,
    sessions,
    focusPane,
    spawnInPane,
    takePendingPaneSpawn,
    clearPendingPaneSpawn,
    closePane,
    restartSession,
    swapPanes,
    applySnapLayout,
    setPaneBrowserUrl,
    t,
  } = useSpace();
  const focused = activeWorkspace?.focusedPaneId === paneId;
  const session: TerminalSession | undefined = sessionId ? sessions[sessionId] : undefined;
  const spawning = useRef(false);
  const isBrowser = kind === "browser";

  useEffect(() => {
    if (isBrowser) {
      spawning.current = false;
      return;
    }
    if (sessionId) {
      spawning.current = false;
      return;
    }
    if (!activeWorkspace || spawning.current) return;
    spawning.current = true;
    const pending = takePendingPaneSpawn(paneId);
    void enqueueTerminalSpawn(async () => {
      await yieldToUi();
      return spawnInPane({
        title: pending?.title ?? "Shell",
        command: pending?.command,
        accent: pending?.accent ?? "green",
        paneId,
      });
    }).then((id) => {
      if (id) clearPendingPaneSpawn(paneId);
      else spawning.current = false;
    });
  }, [
    isBrowser,
    sessionId,
    activeWorkspace,
    paneId,
    spawnInPane,
    takePendingPaneSpawn,
    clearPendingPaneSpawn,
  ]);

  return (
    <div
      className={`vs-pane${focused ? " is-focused" : ""}`}
      data-pane-id={paneId}
      onMouseDown={(event) => {
        const noDrag = (event.target as HTMLElement).closest("[data-no-drag]");
        if (noDrag) {
          if (!focused) focusPane(paneId);
          return;
        }

        const handle = (event.target as HTMLElement).closest("[data-pane-drag]");
        if (!handle) {
          if (!focused) focusPane(paneId);
          return;
        }

        event.preventDefault();
        if (!focused) focusPane(paneId);
        const fromId = handle.getAttribute("data-pane-drag") || paneId;
        emitPaneDrag(true);

        const onMove = (moveEvent: MouseEvent) => {
          document.querySelectorAll(".vs-pane.is-dropTarget").forEach((el) => {
            el.classList.remove("is-dropTarget", "is-zone-left", "is-zone-center", "is-zone-right");
          });
          document.querySelectorAll(".vs-snapOption.is-dropTarget").forEach((el) => {
            el.classList.remove("is-dropTarget");
          });
          const el = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
          const snap = el?.closest("[data-snap-layout]") as HTMLElement | null;
          if (snap) {
            snap.classList.add("is-dropTarget");
            return;
          }
          const target = el?.closest("[data-pane-id]") as HTMLElement | null;
          const toId = target?.getAttribute("data-pane-id");
          if (toId && toId !== fromId && target) {
            target.classList.add("is-dropTarget");
            const rect = target.getBoundingClientRect();
            const ratio = (moveEvent.clientX - rect.left) / Math.max(1, rect.width);
            if (ratio < 0.33) target.classList.add("is-zone-left");
            else if (ratio > 0.66) target.classList.add("is-zone-right");
            else target.classList.add("is-zone-center");
          }
        };

        const onUp = (upEvent: MouseEvent) => {
          window.removeEventListener("mouseup", onUp);
          window.removeEventListener("mousemove", onMove);
          document.querySelectorAll(".vs-pane.is-dropTarget").forEach((el) => {
            el.classList.remove("is-dropTarget", "is-zone-left", "is-zone-center", "is-zone-right");
          });
          document.querySelectorAll(".vs-snapOption.is-dropTarget").forEach((el) => {
            el.classList.remove("is-dropTarget");
          });

          const el = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
          const snap = el?.closest("[data-snap-layout]") as HTMLElement | null;
          const snapId = snap?.getAttribute("data-snap-layout");
          emitPaneDrag(false);
          if (snapId) {
            void applySnapLayout(snapId as SnapLayoutId, fromId);
            return;
          }

          const target = el?.closest("[data-pane-id]") as HTMLElement | null;
          const toId = target?.getAttribute("data-pane-id");
          if (toId && toId !== fromId) swapPanes(fromId, toId);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }}
    >
      {isBrowser ? (
        <NativeBrowser
          compact
          dragPaneId={paneId}
          instanceId={paneId}
          url={browserUrl || ""}
          onUrlChange={(url) => setPaneBrowserUrl(paneId, url)}
          onClose={() => void closePane(paneId)}
        />
      ) : session ? (
        <TerminalPane
          isActive={focused}
          session={session}
          paneId={paneId}
          onFocus={() => {
            if (!focused) focusPane(paneId);
          }}
          onClose={() => void closePane(paneId)}
          onRestart={() => void restartSession(session.id)}
        />
      ) : (
        <div className="vs-paneEmpty">
          <div className="vs-paneLoader" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <h3>{t("term.starting")}</h3>
          <p>{t("term.startingHint")}</p>
        </div>
      )}
    </div>
  );
}

function SplitView({ node }: { node: SplitNode }) {
  const { setSplitRatio } = useSpace();

  if (node.type === "leaf") {
    return (
      <PaneLeaf
        paneId={node.paneId}
        kind={node.kind ?? "terminal"}
        sessionId={node.sessionId}
        browserUrl={node.browserUrl ?? null}
      />
    );
  }

  const ratio = Math.min(0.78, Math.max(0.22, Number.isFinite(node.ratio) ? node.ratio : 0.5));
  const firstPct = `${(ratio * 100).toFixed(3)}%`;
  const firstStyle = {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: firstPct,
    maxWidth: node.direction === "h" ? firstPct : undefined,
    maxHeight: node.direction === "v" ? firstPct : undefined,
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
  } as CSSProperties;
  const secondStyle = {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
  } as CSSProperties;

  return (
    <div className={`vs-splitNode is-${node.direction}`}>
      <div className="vs-splitChild is-first" style={firstStyle}>
        <SplitView node={node.first} />
      </div>
      <div
        className="vs-splitDivider"
        role="separator"
        aria-orientation={node.direction === "h" ? "vertical" : "horizontal"}
        onMouseDown={(event) => {
          event.preventDefault();
          const parent = (event.target as HTMLElement).parentElement;
          if (!parent) return;
          const rect = parent.getBoundingClientRect();
          const onMove = (moveEvent: MouseEvent) => {
            const ratio =
              node.direction === "h"
                ? (moveEvent.clientX - rect.left) / rect.width
                : (moveEvent.clientY - rect.top) / rect.height;
            setSplitRatio(node.id, ratio);
          };
          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
      />
      <div className="vs-splitChild is-second" style={secondStyle}>
        <SplitView node={node.second} />
      </div>
    </div>
  );
}

export function SplitGrid({ layout }: { layout: SplitNode }) {
  return (
    <div className="vs-splitRoot">
      <SplitView node={layout} />
    </div>
  );
}
