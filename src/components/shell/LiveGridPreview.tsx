import { useEffect, useMemo, useState } from "react";
import type { GridPreset } from "@/features/workspace/layout";

type PreviewPane = {
  title: string;
  lines: string[];
  accent: "shell" | "agent" | "browser";
};

const LAYOUTS: Record<GridPreset, PreviewPane[]> = {
  1: [
    {
      title: "Shell",
      lines: ["$ cd ./apps/web", "$ npm run dev", "ready on :3000"],
      accent: "shell",
    },
  ],
  2: [
    {
      title: "Shell",
      lines: ["$ npm run dev", "listening…", "http://127.0.0.1:3000"],
      accent: "shell",
    },
    {
      title: "Shell",
      lines: ["> opencode", "ready", "awaiting prompt"],
      accent: "agent",
    },
  ],
  4: [
    {
      title: "Shell",
      lines: ["$ npm run dev", "ready on :3000"],
      accent: "shell",
    },
    {
      title: "OpenCode",
      lines: ["> opencode", "implement pricing"],
      accent: "agent",
    },
    {
      title: "Claude",
      lines: ["> claude", "reviewing diff"],
      accent: "agent",
    },
    {
      title: "Shell",
      lines: ["$ git status", "clean"],
      accent: "shell",
    },
  ],
  8: [
    {
      title: "Shell",
      lines: ["$ npm run dev", "ready"],
      accent: "shell",
    },
    {
      title: "OpenCode",
      lines: ["> opencode", "listening"],
      accent: "agent",
    },
    {
      title: "Claude",
      lines: ["> claude", "review"],
      accent: "agent",
    },
    {
      title: "Browser",
      lines: ["localhost:3000", "ok"],
      accent: "browser",
    },
    {
      title: "Codex",
      lines: ["> codex", "plan"],
      accent: "agent",
    },
    {
      title: "Git",
      lines: ["$ git status", "clean"],
      accent: "shell",
    },
    {
      title: "Aider",
      lines: ["> aider", "edit"],
      accent: "agent",
    },
    {
      title: "Logs",
      lines: ["tail -f", "ready"],
      accent: "browser",
    },
  ],
};

function TypedLine({ text, active }: { text: string; active: boolean }) {
  const [shown, setShown] = useState(active ? "" : text);

  useEffect(() => {
    if (!active) {
      setShown(text);
      return;
    }
    setShown("");
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, 26);
    return () => window.clearInterval(id);
  }, [text, active]);

  return (
    <div className="vs-welcomePreviewLine">
      {shown}
      {active && shown.length < text.length ? <span className="vs-welcomeInlineCaret" /> : null}
    </div>
  );
}

export function LiveGridPreview({ panes = 4 }: { panes?: GridPreset }) {
  const visible = useMemo(() => LAYOUTS[panes] ?? LAYOUTS[4], [panes]);
  const [activePane, setActivePane] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);

  useEffect(() => {
    setActivePane(0);
    setLineIndex(0);
  }, [panes]);

  useEffect(() => {
    const pane = visible[activePane];
    if (!pane) return;
    const line = pane.lines[lineIndex] ?? "";
    const duration = Math.max(850, line.length * 26 + 380);
    const id = window.setTimeout(() => {
      if (lineIndex < pane.lines.length - 1) {
        setLineIndex((n) => n + 1);
      } else {
        setActivePane((n) => (n + 1) % visible.length);
        setLineIndex(0);
      }
    }, duration);
    return () => window.clearTimeout(id);
  }, [activePane, lineIndex, visible]);

  return (
    <div className="vs-welcomePreview" aria-hidden>
      <div className="vs-welcomePreviewChrome">
        <span />
        <span />
        <span />
        <strong>
          {panes === 1
            ? "1 terminal"
            : panes === 2
              ? "2 terminals"
              : `${panes} panes`}
        </strong>
      </div>
      <div className={`vs-welcomePreviewGrid is-${panes}`}>
        {visible.map((pane, index) => {
          const isActive = index === activePane;
          return (
            <div
              key={`${pane.title}-${index}`}
              className={`vs-welcomePreviewPane is-${pane.accent}${isActive ? " is-typing" : ""}`}
              style={{ animationDelay: `${index * 55}ms` }}
            >
              <div className="vs-welcomePreviewBar">
                <b>{pane.title}</b>
                <i />
              </div>
              <div className="vs-welcomePreviewCode">
                {pane.lines.map((line, li) => {
                  if (isActive && li > lineIndex) return null;
                  const typing = isActive && li === lineIndex;
                  return <TypedLine key={`${pane.title}-${li}`} text={line} active={typing} />;
                })}
                {isActive ? <div className="vs-welcomeCaret" /> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
