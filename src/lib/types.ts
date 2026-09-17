export type ViewId =
  | "space"
  | "projects"
  | "agents"
  | "board"
  | "history"
  | "browser"
  | "settings";

export type Accent = "blue" | "gold" | "green" | "violet";

/** Workspace identity color — shown as cmux-style left rail (not a filled avatar). */
export type SpaceColor = "default" | "green" | "red" | "amber" | "violet" | "cyan" | "rose";

export const SPACE_COLORS: SpaceColor[] = [
  "default",
  "green",
  "red",
  "amber",
  "violet",
  "cyan",
  "rose",
];

/** Colors you can assign (default = no custom rail). */
export const SPACE_TAB_COLORS: Exclude<SpaceColor, "default">[] = [
  "green",
  "red",
  "amber",
  "violet",
  "cyan",
  "rose",
];

export const SPACE_COLOR_HEX: Record<Exclude<SpaceColor, "default">, string> = {
  green: "#3dd68c",
  red: "#ff6b6b",
  amber: "#f0c14b",
  violet: "#a78bfa",
  cyan: "#22d3ee",
  rose: "#fb7185",
};

export type TerminalStatus = "online" | "closed" | "starting" | "error";

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
  /**
   * Native agent resume CLI (e.g. `claude --resume abc`, `opencode --session xyz`).
   * Preferred over initialCommand when restoring across quits/reboots.
   */
  resumeCommand?: string;
  /** Stable agent bot id when this tab is an agent CLI (opencode, gemini, …). */
  agentId?: string;
};

export type SplitDirection = "h" | "v";

export type PaneKind = "terminal" | "browser" | "media";

/** One in-pane browser surface (cmux allows many browsers in the same strip). */
export type BrowserTabState = {
  id: string;
  url: string;
};

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
       * Session ids, `"__media__"`, and `"__browser__:<id>"` (or legacy `"__browser__"`).
       */
      tabOrder?: string[];
      /**
       * Active / legacy single browser URL.
       * Prefer `browserTabs` when present; kept for persistence back-compat.
       */
      browserUrl: string | null;
      /** Multiple browser tabs in this pane (cmux-style). */
      browserTabs?: BrowserTabState[];
      /** Which browser tab is focused when several exist. */
      activeBrowserId?: string | null;
      /** In-pane image/media preview (absolute path). */
      mediaPath?: string | null;
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
  /** Alternate CLI names (any one counts as ready). */
  commands?: string[];
  accent: Accent;
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
  /** Live PTY session — resume focuses this tab when still online. */
  sessionId?: string;
  paneId?: string;
  /** From on-disk vault index (cmux-style), not a live Voxiva run. */
  vaultId?: string;
  resumeCommand?: string;
};

/** Indexed agent session from local transcript files (Vault). */
export type VaultSession = {
  id: string;
  agentId: string;
  title: string;
  cwd: string;
  mtimeMs: number;
  resumeCommand?: string | null;
  source: string;
};
