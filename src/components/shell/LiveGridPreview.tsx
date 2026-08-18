import { useMemo } from "react";
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

/** Static grid preview — no timers so welcome screen stays smooth on launch. */
export function LiveGridPreview({ panes = 4 }: { panes?: GridPreset }) {
  const visible = useMemo(() => LAYOUTS[panes] ?? LAYOUTS[4], [panes]);

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
        {visible.map((pane, index) => (
          <div
            key={`${pane.title}-${index}`}
            className={`vs-welcomePreviewPane is-${pane.accent}`}
            style={{ animationDelay: `${index * 55}ms` }}
          >
            <div className="vs-welcomePreviewBar">
              <b>{pane.title}</b>
              <i />
            </div>
            <div className="vs-welcomePreviewCode">
              {pane.lines.map((line, li) => (
                <div key={`${pane.title}-${li}`} className="vs-welcomePreviewLine">
                  {line}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
