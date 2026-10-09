import { useEffect, useMemo, useRef, useState } from "react";
import markUrl from "@/assets/brand/voxiva-space-mark.svg";
import { AgentBrandIcon } from "@/components/agents/AgentBrandIcon";
import { WelcomeTypedLines } from "@/components/shell/WelcomeTypedLines";
import {
  dwellMsForPane,
  termLineClass,
  welcomePreviewCells,
  welcomePreviewForGrid,
  type WelcomePreviewPane,
} from "@/components/shell/welcomePreviewLines";
import type { GridPreset } from "@/features/workspace/layout";

function BrowserMockBody({ focused }: { focused: boolean }) {
  return (
    <div className={`vs-welcomeBrowserMock${focused ? " is-active" : ""}`}>
      <span className="vs-welcomeBrowserUrl">localhost:3000/pricing</span>
      <div className="vs-welcomeBrowserBlocks">
        <span />
        <span className="is-accent" />
        <span />
      </div>
      <div className="vs-welcomeBrowserPick">
        <span className="vs-welcomeBrowserPickRing" />
        Hero.tsx · #pricing-hero
      </div>
    </div>
  );
}

function PreviewPaneCard({
  pane,
  index,
  focused,
  motionOk,
  resetBase,
  dense,
}: {
  pane: WelcomePreviewPane;
  index: number;
  focused: boolean;
  motionOk: boolean;
  resetBase: number;
  dense?: boolean;
}) {
  if (pane.accent === "browser") {
    return (
      <div
        className={`vs-welcomePreviewPane is-browser${focused ? " is-typing" : ""}`}
        style={{ animationDelay: `${index * 55}ms` }}
      >
        <div className="vs-welcomePreviewBar">
          <AgentBrandIcon id="shell" size={14} />
          <b>Browser</b>
          <i className={focused ? "is-blue" : undefined} />
        </div>
        <BrowserMockBody focused={focused} />
      </div>
    );
  }

  const staticLines = dense ? pane.lines.slice(-3) : pane.lines.slice(-4);

  return (
    <div
      className={`vs-welcomePreviewPane is-${pane.accent}${focused ? " is-typing" : ""}`}
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <div className="vs-welcomePreviewBar">
        <AgentBrandIcon id={pane.agentId} size={14} />
        <b>{pane.title}</b>
        <i className={focused ? "is-blue" : undefined} />
      </div>
      {focused && motionOk ? (
        <WelcomeTypedLines
          lines={pane.lines}
          live
          resetKey={resetBase + index}
          typing={pane.typing}
        />
      ) : (
        <div className={`vs-welcomePreviewCode is-static${dense ? " is-dense" : ""}`}>
          {staticLines.map((line, li) => (
            <div key={`${pane.title}-${li}`} className={`vs-welcomePreviewLine ${termLineClass(line)}`}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type Props = {
  panes?: GridPreset;
};

/** Marketing-style live grid — one typing pane at a time to stay smooth. */
export function LiveGridPreview({ panes = 4 }: Props) {
  const layout = useMemo(() => welcomePreviewForGrid(panes), [panes]);
  const cells = useMemo(() => welcomePreviewCells(panes), [panes]);
  const focusables = useMemo(
    () => (layout.mode === "browser-column" ? [...layout.terminals, layout.browser] : cells),
    [cells, layout],
  );

  const [focusPane, setFocusPane] = useState(0);
  const [paused, setPaused] = useState(false);
  const [motionOk, setMotionOk] = useState(true);
  const rotateRef = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setMotionOk(!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (rotateRef.current) window.clearTimeout(rotateRef.current);
    if (paused || !motionOk || focusables.length <= 1) return;

    let index = 0;
    setFocusPane(0);

    const tick = () => {
      const pane = focusables[index];
      const wait = pane ? dwellMsForPane(pane) : 6000;
      rotateRef.current = window.setTimeout(() => {
        if (document.hidden) {
          tick();
          return;
        }
        index = (index + 1) % focusables.length;
        setFocusPane(index);
        tick();
      }, wait);
    };

    tick();
    return () => {
      if (rotateRef.current) window.clearTimeout(rotateRef.current);
    };
  }, [paused, motionOk, focusables, panes]);

  const gridClass = [
    "vs-welcomePreviewGrid",
    `is-${panes}`,
    layout.mode === "browser-column" ? "is-withBrowser" : "",
    layout.mode === "browser-in-grid" ? "is-browserCell" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const resetBase = panes * 100;
  const dense = panes >= 8;

  return (
    <div
      className="vs-welcomePreview"
      aria-hidden
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="vs-welcomePreviewChrome">
        <img src={markUrl} alt="" className="vs-welcomePreviewMark" />
        <div className="vs-welcomePreviewMeta">
          <strong>My Space</strong>
          <span>./project · main</span>
        </div>
        <span className="vs-livePill">
          <i className="vs-livePillDot" />
          Live
        </span>
      </div>

      {layout.mode === "browser-column" ? (
        <div className={gridClass}>
          <div className="vs-welcomePreviewTerminals">
            {layout.terminals.map((pane, index) => (
              <PreviewPaneCard
                key={`${pane.title}-${index}`}
                pane={pane}
                index={index}
                focused={index === focusPane}
                motionOk={motionOk}
                resetBase={resetBase}
              />
            ))}
          </div>
          <PreviewPaneCard
            pane={layout.browser}
            index={layout.terminals.length}
            focused={focusPane === layout.terminals.length}
            motionOk={motionOk}
            resetBase={resetBase}
          />
        </div>
      ) : (
        <div className={gridClass}>
          {cells.map((pane, index) => (
            <PreviewPaneCard
              key={`${pane.title}-${index}`}
              pane={pane}
              index={index}
              focused={index === focusPane}
              motionOk={motionOk}
              resetBase={resetBase}
              dense={dense}
            />
          ))}
        </div>
      )}
    </div>
  );
}
