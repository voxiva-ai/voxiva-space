import type { GridPreset } from "@/features/workspace/layout";
import { WELCOME_BROWSER_CELL_INDEX } from "@/features/workspace/layout";

export function termLineClass(line: string) {
  if (
    line.startsWith("✓") ||
    line.includes("passed") ||
    line.includes("ok ·") ||
    line.includes("clean")
  ) {
    return "is-ok";
  }
  if (line.startsWith("◐") || line.startsWith("…")) return "is-spin";
  if (line.startsWith("$") || line.startsWith("PS ")) return "is-prompt";
  if (line.startsWith(">")) return "is-cmd";
  if (line.startsWith("·") || line.startsWith("editing") || line.startsWith("plan:")) {
    return "is-edit";
  }
  if (line.includes("http://") || line.includes("https://") || line.startsWith("GET")) {
    return "is-url";
  }
  if (line.startsWith("▲") || line.startsWith("- Local:")) return "is-info";
  if (line.startsWith("-") || line.startsWith("test ")) return "is-dim";
  if (line.includes("await") || line.includes("approve")) return "is-warn";
  return "";
}

export type WelcomeTypingProfile = {
  charDelay: number;
  phaseOffset: number;
  jitter?: number;
};

export type WelcomePreviewPane = {
  title: string;
  agentId: string;
  lines: string[];
  accent: "shell" | "agent" | "browser";
  typing: WelcomeTypingProfile;
};

export type WelcomePreviewLayout = {
  mode: "plain" | "browser-column" | "browser-in-grid";
  terminals: WelcomePreviewPane[];
  browser: WelcomePreviewPane;
};

const BROWSER: WelcomePreviewPane = {
  title: "Browser",
  agentId: "shell",
  lines: ["localhost:3000/pricing", "Brush → Hero.tsx · Send to OpenCode"],
  accent: "browser",
  typing: { charDelay: 0, phaseOffset: 0 },
};

const TYPING = {
  shellFast: { charDelay: 11, phaseOffset: 80, jitter: 3 },
  shellSlow: { charDelay: 14, phaseOffset: 120, jitter: 4 },
  opencode: { charDelay: 15, phaseOffset: 160, jitter: 5 },
  claude: { charDelay: 17, phaseOffset: 200, jitter: 6 },
  codex: { charDelay: 19, phaseOffset: 240, jitter: 7 },
  gemini: { charDelay: 14, phaseOffset: 180, jitter: 4 },
  aider: { charDelay: 16, phaseOffset: 150, jitter: 5 },
  cursor: { charDelay: 18, phaseOffset: 220, jitter: 6 },
} as const satisfies Record<string, WelcomeTypingProfile>;

const GRID_TERMINALS: Record<GridPreset, WelcomePreviewPane[]> = {
  1: [
    {
      title: "Shell",
      agentId: "shell",
      lines: [
        "$ npm run dev",
        "▲ Vite · ready",
        "- Local: http://127.0.0.1:3000",
        "- Network: use --host",
        "✓ Ready in 812ms",
      ],
      accent: "shell",
      typing: TYPING.shellSlow,
    },
  ],
  2: [
    {
      title: "Shell",
      agentId: "shell",
      lines: [
        "$ npm run dev",
        "▲ listening on :3000",
        "- HMR enabled",
        "✓ HMR connected",
      ],
      accent: "shell",
      typing: TYPING.shellFast,
    },
    {
      title: "OpenCode",
      agentId: "opencode",
      lines: [
        "> ship pricing section",
        "◐ reading src/pages/pricing.tsx",
        "· Edit pricing.tsx  +48 −12",
        "· Edit PricingHero.tsx  +22 −4",
        "✓ lint clean · 2 files",
      ],
      accent: "agent",
      typing: TYPING.opencode,
    },
  ],
  4: [
    {
      title: "Shell",
      agentId: "shell",
      lines: [
        "$ npm run dev",
        "▲ Next.js · Turbopack",
        "- Local: http://127.0.0.1:3000",
        "✓ ready on :3000",
      ],
      accent: "shell",
      typing: TYPING.shellFast,
    },
    {
      title: "OpenCode",
      agentId: "opencode",
      lines: [
        "> implement hero layout",
        "◐ reading src/components/Hero.tsx",
        "· Edit Hero.tsx  +36 −8",
        "· Edit HeroSection.tsx",
        "✓ 2 files · lint clean",
      ],
      accent: "agent",
      typing: TYPING.opencode,
    },
    {
      title: "Claude",
      agentId: "claude",
      lines: [
        "> review auth guard",
        "· Read src/auth/guard.ts",
        "· Edit guard.ts  +14 −6",
        "· Run npm test -- guard",
        "✓ Tests 18 passed",
      ],
      accent: "agent",
      typing: TYPING.claude,
    },
    {
      title: "Codex",
      agentId: "codex",
      lines: [
        "> add FAQ accordion",
        "plan: Faq.tsx + FaqItem.tsx",
        "editing src/components/Faq.tsx",
        "… awaiting approve",
      ],
      accent: "agent",
      typing: TYPING.codex,
    },
  ],
  8: [
    {
      title: "Shell",
      agentId: "shell",
      lines: ["$ npm run dev", "▲ Turbopack", "- Local: :3000", "✓ ready"],
      accent: "shell",
      typing: TYPING.shellFast,
    },
    {
      title: "OpenCode",
      agentId: "opencode",
      lines: [
        "> ship split layout",
        "◐ reading SplitGrid.tsx",
        "· Edit SplitGrid.tsx",
        "✓ layout saved",
      ],
      accent: "agent",
      typing: TYPING.opencode,
    },
    {
      title: "Claude",
      agentId: "claude",
      lines: [
        "> tighten subscription guard",
        "· Read subscription.guard.ts",
        "· Edit guard.ts  +14 −6",
        "✓ tests passed",
      ],
      accent: "agent",
      typing: TYPING.claude,
    },
    {
      title: "Codex",
      agentId: "codex",
      lines: [
        "> add FAQ accordion",
        "plan: Faq.tsx + FaqItem.tsx",
        "editing Faq.tsx",
        "… awaiting approve",
      ],
      accent: "agent",
      typing: TYPING.codex,
    },
    {
      title: "Gemini",
      agentId: "gemini",
      lines: [
        "> draft release notes",
        "◐ scanning last 12 commits",
        "· Wrote docs/CHANGELOG.md",
        "✓ notes ready for review",
      ],
      accent: "agent",
      typing: TYPING.gemini,
    },
    {
      title: "Aider",
      agentId: "aider",
      lines: [
        "> polish welcome styles",
        "· Read welcome.css",
        "· Edit welcome.css  +28 −9",
        "✓ saved",
      ],
      accent: "agent",
      typing: TYPING.aider,
    },
    {
      title: "Cursor",
      agentId: "cursor-agent",
      lines: [
        "> fix pane tab icons",
        "◐ reading sessionAgent.ts",
        "· Edit sessionAgent.ts",
        "✓ types clean",
      ],
      accent: "agent",
      typing: TYPING.cursor,
    },
    {
      title: "Logs",
      agentId: "shell",
      lines: ["$ tail -f .voxiva/logs", "listening on events…", "- agent run #42 started"],
      accent: "shell",
      typing: TYPING.shellSlow,
    },
  ],
};

/** Browser slot in the 8-pane grid (top-right of the first row). */
export { WELCOME_BROWSER_CELL_INDEX };

export function welcomePreviewForGrid(grid: GridPreset): WelcomePreviewLayout {
  const terminals = GRID_TERMINALS[grid] ?? GRID_TERMINALS[4];
  if (grid === 4) {
    return { mode: "browser-column", terminals, browser: BROWSER };
  }
  if (grid === 8) {
    return {
      mode: "browser-in-grid",
      terminals: GRID_TERMINALS[8],
      browser: BROWSER,
    };
  }
  return { mode: "plain", terminals, browser: BROWSER };
}

export function welcomePreviewCells(grid: GridPreset): WelcomePreviewPane[] {
  const layout = welcomePreviewForGrid(grid);
  if (layout.mode === "browser-column") return layout.terminals;
  if (layout.mode === "browser-in-grid") {
    const cells = [...GRID_TERMINALS[8]];
    cells[WELCOME_BROWSER_CELL_INDEX] = layout.browser;
    return cells;
  }
  return layout.terminals;
}

export function dwellMsForPane(pane: WelcomePreviewPane): number {
  if (pane.accent === "browser") return 6400;
  const chars = pane.lines.join("").length;
  const lines = pane.lines.length;
  return Math.max(5800, Math.min(11000, chars * 42 + lines * 420));
}
