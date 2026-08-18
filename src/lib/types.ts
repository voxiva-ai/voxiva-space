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
  /** Command used to open the terminal again after Voxiva Space restarts. */
  initialCommand?: string;
};

export type SplitDirection = "h" | "v";

export type PaneKind = "terminal" | "browser";

export type SplitNode =
  | {
      type: "leaf";
      paneId: string;
      kind: PaneKind;
      /** Active terminal in this pane. */
      sessionId: string | null;
      /** All terminal tabs in this pane (includes active). Empty / missing = just sessionId. */
      sessionIds?: string[];
      /**
       * Visual order of surfaces in the tab strip.
       * Session ids and the sentinel `"__browser__"`.
       */
      tabOrder?: string[];
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
  /** Pinned spaces stay at the top of the sidebar list. */
  pinned?: boolean;
  /** Saved shells for this space — never auto-start; user launches from empty pane / settings. */
  shellPresets?: WorkspaceShellPreset[];
};

/** A shell the user can launch into this space (settings + empty-pane quick add). */
export type WorkspaceShellPreset = {
  id: string;
  title: string;
  /** Optional command run after the shell opens (e.g. `npm run dev`). */
  command?: string;
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

/** A recorded agent launch — the "Recent agents" sidebar history entry. */
export type AgentRun = {
  id: string;
  /** Bot id: "opencode" | "codex" | "gemini" | "claude" | "aider" | "cursor-agent" | "amp" | "goose" | "shell" | custom. */
  agentId: string;
  /** Display name from the bot. */
  agentName: string;
  workspaceId: string;
  workspaceName: string;
  cwd: string;
  /** Raw command used at launch (e.g. "opencode", "codex"). */
  command?: string;
  shell?: string | null;
  accent: Accent;
  /** Date.now() */
  at: number;
};
