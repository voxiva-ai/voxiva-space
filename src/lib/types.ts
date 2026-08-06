export type ViewId =
  | "space"
  | "editor"
  | "projects"
  | "agents"
  | "board"
  | "history"
  | "browser"
  | "settings";

export type Accent = "blue" | "gold" | "green" | "violet";

/** Stable color identity for a space (sidebar dot). */
export type SpaceColor = "green" | "red" | "amber" | "violet" | "cyan" | "rose";

export const SPACE_COLORS: SpaceColor[] = ["green", "red", "amber", "violet", "cyan", "rose"];

export type TerminalStatus = "online" | "closed" | "error";

export type TerminalSession = {
  id: string;
  title: string;
  cwd: string;
  shell: string;
  status: TerminalStatus;
  accent: Accent;
  needsAttention: boolean;
};

export type SplitDirection = "h" | "v";

export type PaneKind = "terminal" | "browser";

export type SplitNode =
  | {
      type: "leaf";
      paneId: string;
      kind: PaneKind;
      sessionId: string | null;
      browserUrl: string | null;
    }
  | {
      type: "split";
      id: string;
      direction: SplitDirection;
      ratio: number;
      first: SplitNode;
      second: SplitNode;
    };

export type Workspace = {
  id: string;
  name: string;
  cwd: string;
  branch: string | null;
  color: SpaceColor;
  layout: SplitNode;
  focusedPaneId: string;
};

export type HistoryItem = {
  workspaceId: string;
  workspaceName: string;
  cwd: string;
  at: number;
};

export type AgentBot = {
  id: string;
  name: string;
  description: string;
  shell?: string;
  /** Primary CLI name on PATH. */
  command?: string;
  /** Alternate CLI names (any one counts as installed). */
  commands?: string[];
  accent: Accent;
  /** Official docs / installer page for this CLI. */
  installUrl?: string;
};

export type AgentAvailability = Record<string, boolean>;
