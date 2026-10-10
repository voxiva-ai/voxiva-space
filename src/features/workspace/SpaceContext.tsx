import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { listen, getCurrentWindow } from "@/platform/desktop";
import { uid } from "@/lib/constants";
import { clientError } from "@/lib/errors";
import type {
  Accent,
  AgentAvailability,
  AgentRun,
  HistoryItem,
  SpaceColor,
  SplitDirection,
  SplitNode,
  TerminalSession,
  ViewId,
  Workspace,
} from "@/lib/types";
import { SPACE_COLORS } from "@/lib/types";
import {
  checkCommands,
  createTerminalSession,
  getDefaultTerminalCwd,
  getGitBranch,
  isVsCodeServeWebUrl,
  killTerminalSession,
  vscodeServeWebFolderUrl,
} from "@/features/terminal/api";
import { enqueueTerminalSpawn, yieldToUi } from "@/features/terminal/spawnQueue";
import { loadTerminalPrefs } from "@/features/terminal/prefs";
import {
  outputNeedsAttention,
} from "@/features/attention/prefs";
import {
  attentionStamp,
  attentionReason,
  clearAttentionNotifyState,
  notifyAttention,
  notifySessionExit,
  shouldScanOutputForAttention,
  stampAttention,
} from "@/features/attention/notify";
import { browserClose } from "@/features/browser/api";
import { normalizeBrowserUrl, resolveOmniboxInput } from "@/features/browser/url";
import {
  createTask,
  loadBoard,
  saveBoard,
  type TaskPriority,
} from "@/features/board/store";
import {
  companionAppendOutput,
  companionPushSnapshot,
  companionSetWorkspace,
  companionStatus,
  type CompanionInputEvent,
  type CompanionRenameEvent,
  type CompanionSpawnEvent,
  type CompanionTaskEvent,
} from "@/features/companion/api";
import { isCompanionLive, setCompanionLive } from "@/features/companion/live";
import { writeTerminalSession } from "@/features/terminal/api";
import {
  formatAgentAttachment,
  wrapAgentPaste,
} from "@/features/terminal/paste";
import {
  agentBots,
  commandKeysForBots,
  isBotReady,
  resolveBotCommand,
  resumeCommandFor,
} from "@/features/agents/bots";
import {
  loadAutoResumeAgents,
  lookupVaultResumeCommand,
  resolveRestoreCommand,
  saveAutoResumeAgents,
} from "@/features/agents/resume";
import {
  focusBack,
  focusForward,
  popClosed,
  pushClosed,
  pushFocus,
  type ClosedSurface,
  type FocusPoint,
} from "@/features/workspace/sessionNav";
import {
  detectAgentFromOutput,
  isIdleShellTitle,
  agentIdForSession,
  agentIdFromCommand,
} from "@/features/agents/sessionAgent";
import type { TerminalExitEvent, TerminalOutputEvent } from "@/features/terminal/types";
import {
  buildCreateLayout,
  buildWelcomeLayout,
  arrangeSnapLayout,
  collectLeaves,
  collectPaneIds,
  collectSessionIds,
  countLeaves,
  createLeaf,
  equalizeLayout,
  findLeaf,
  findPaneForSession,
  firstPaneId,
  type GridPreset,
  type SnapLayoutId,
  removePane,
  clampLayoutRatios,
  setLeafBrowser,
  setLeafMedia,
  openBrowserTab,
  openMediaTab,
  closeBrowserTab,
  focusBrowserTab,
  reorderLeafTabs,
  placeLeafTab,
  dockTab,
  BROWSER_TAB,
  MEDIA_TAB,
  leafHasBrowser,
  leafHasMedia,
  leafSurfaceCount,
  normalizeBrowserTabs,
  activeBrowserTab,
  isBrowserTabKey,
  makeBrowserTabKey,
  browserIdFromTabKey,
  setLeafSession,
  addLeafSession,
  activateLeafSession,
  removeLeafSession,
  replaceLeafSessionId,
  leafTabIds,
  setRatio,
  addBrowserBeside,
  addBrowserAtZone,
  addMediaAtZone,
  addShellBeside,
  addShellAtZone,
  addBrowserRoot,
  movePane,
  type DropZone,
} from "./layout";
import { loadPersisted, savePersisted, flushPersisted, MAX_AGENT_RUNS, type ThemeId } from "./persist";
import {
  buildLayoutFromSaved,
  captureWorkspaceLayout,
  normalizeSavedLayouts,
  savedLayoutPaneCount,
  type SavedShellSpec,
  type SavedWorkspaceLayout,
} from "./savedLayouts";
import { translate, type Locale, type MsgKey } from "@/i18n";
import { applyTheme, resolveThemeId } from "@/features/theme";
import { syncWindowGlass } from "@/features/theme/windowGlass";
import { isPreviewDropPath } from "./workspaceFileDrop";

const MAX_PANES = 8;
const MAX_HISTORY = 48;
const PTY_COLS = 80;
const PTY_ROWS = 24;

type SpawnOptions = {
  title: string;
  shell?: string | null;
  command?: string;
  accent?: Accent;
  paneId?: string;
  /** Bot id when known (history / drag) — preferred over title matching. */
  agentId?: string;
  /** replace = kill current tabs (default for empty). tab = add alongside. */
  mode?: "replace" | "tab";
  background?: boolean;
  /** History drop / repeat launch — do not steal focus of an already-live agent. */
  forceNew?: boolean;
  /** Bracketed paste payload after the shell is online (file drop on empty pane). */
  paste?: string;
  /** Spawn inside a specific workspace (resume/history — avoids stale activeWorkspace). */
  workspaceId?: string;
};

type EnterSpaceOptions = {
  name: string;
  cwd: string;
  grid: GridPreset;
  agentIds?: string[];
};

export type CreateWorkspaceOptions = {
  name: string;
  cwd: string;
  grid?: GridPreset;
  /** @deprecated prefer grid */
  terminals?: number;
  includeBrowser?: boolean;
  color?: SpaceColor;
  agentIds?: string[];
  /** Fork: seed the first pane with this spawn instead of an idle Shell. */
  seedSpawn?: Omit<SpawnOptions, "paneId">;
  /** Fork: open the first pane as a browser on this URL. */
  seedBrowserUrl?: string;
  /** Known branch — skips the `git` probe so a fork opens without a round-trip. */
  branch?: string | null;
};

/** Where a forked conversation lands (cmux "Fork Conversation to..."). */
export type ForkTarget = "tab" | "right" | "workspace";

/** `Space` → `Space fork`, then `Space fork 2`, … so parallel branches stay readable. */
function nextForkName(base: string, existing: Workspace[]): string {
  const root = base.replace(/\s+fork(\s+\d+)?$/i, "").trim() || "Space";
  const taken = new Set(existing.map((ws) => ws.name));
  let candidate = `${root} fork`;
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${root} fork ${n}`;
  return candidate;
}

function isSpaceColor(value: unknown): value is SpaceColor {
  return typeof value === "string" && (SPACE_COLORS as string[]).includes(value);
}

function pickSpaceColor(_existing: Workspace[], preferred?: SpaceColor): SpaceColor {
  if (preferred && isSpaceColor(preferred)) return preferred;
  // cmux-style: new spaces start without a custom tab color.
  return "default";
}

function normSpacePath(path: string) {
  return path.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function normSpaceName(name: string) {
  return name.trim().toLowerCase() || "space";
}

function findWorkspaceByIdentity(
  list: Workspace[],
  name: string,
  cwd: string,
): Workspace | undefined {
  const keyName = normSpaceName(name);
  const keyCwd = normSpacePath(cwd);
  return list.find(
    (ws) => normSpaceName(ws.name) === keyName && normSpacePath(ws.cwd) === keyCwd,
  );
}

function resolveGrid(opts: CreateWorkspaceOptions): GridPreset {
  if (opts.grid === 1 || opts.grid === 2 || opts.grid === 4 || opts.grid === 8) return opts.grid;
  const n = Math.max(1, Math.min(8, Math.floor(opts.terminals ?? 2)));
  if (n <= 1) return 1;
  if (n === 2) return 2;
  if (n <= 4) return 4;
  return 8;
}

function queuePaneSpawns(
  target: Map<string, SpawnOptions>,
  layout: SplitNode,
  agentIds: string[] | undefined,
  availability: AgentAvailability,
) {
  const terminals = collectLeaves(layout).filter((leaf) => (leaf.kind ?? "terminal") !== "browser");
  const bots = (agentIds ?? [])
    .map((id) => agentBots.find((bot) => bot.id === id))
    .filter((bot): bot is (typeof agentBots)[number] => Boolean(bot));

  terminals.forEach((leaf, index) => {
    const bot = bots[index];
    if (bot) {
      const command = resolveBotCommand(bot, availability);
      target.set(leaf.paneId, {
        title: bot.name,
        command: command || undefined,
        accent: bot.accent,
        agentId: bot.id,
        paneId: leaf.paneId,
      });
    } else {
      target.set(leaf.paneId, {
        title: "Shell",
        accent: "green",
        agentId: "shell",
        paneId: leaf.paneId,
      });
    }
  });
}

function hydrateShellPresets(raw: unknown): Workspace["shellPresets"] {
  if (!Array.isArray(raw)) return [];
  const out: NonNullable<Workspace["shellPresets"]> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    if (!title) continue;
    out.push({
      id: typeof row.id === "string" && row.id ? row.id : uid("shell"),
      title,
      command: typeof row.command === "string" && row.command.trim() ? row.command.trim() : undefined,
    });
  }
  return out;
}

/**
 * A recorded agent run. Shape contract for the "Recent agents" sidebar section.
 */
export type { AgentRun } from "@/lib/types";

type SpaceContextValue = {
  /** Startup / preview welcome overlay — never wipes workspaces. */
  welcomeVisible: boolean;
  dismissWelcome: () => void;
  showWelcomeScreen: () => void;
  skipWelcome: boolean;
  setSkipWelcome: (skip: boolean) => void;
  onboarded: boolean;
  takePendingPaneSpawn: (paneId: string) => SpawnOptions | null;
  /** All pending spawns for a pane (multi-tab saved layouts). */
  takePendingPaneSpawnQueue: (paneId: string) => SpawnOptions[];
  clearPendingPaneSpawn: (paneId: string) => void;
  /** While held, empty panes must not auto-spawn a bare Shell. */
  isEmptyPaneSpawnHeld: (paneId: string) => boolean;
  /** True when an empty pane may auto-spawn Shell (not held, no tabs yet). */
  shouldAutoSpawnShell: (paneId: string) => boolean;
  /** Bumps when a hold is fully released so empty-pane effects can retry. */
  emptyPaneSpawnEpoch: number;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  sessions: Record<string, TerminalSession>;
  recentHistory: HistoryItem[];
  pushHistory: (item: Omit<HistoryItem, "at"> & { at?: number }) => void;
  clearHistory: () => void;
  removeHistoryItem: (workspaceId: string, at: number) => void;
  browserUrl: string;
  setBrowserUrl: (url: string) => void;
  setPaneBrowserUrl: (paneId: string, url: string, tabKey?: string) => void;
  openBrowserInFocused: (
    paneId?: string,
    mode?: "tab" | "beside" | "below" | "left" | "above" | "root",
  ) => Promise<void>;
  /** Focus existing browser tab — never spawns a second browser. */
  focusBrowserInPane: (paneId?: string, tabKey?: string) => void;
  focusMediaInPane: (paneId?: string) => void;
  focusTerminalInPane: (paneId?: string) => Promise<void>;
  closeBrowserTab: (paneId: string, tabKey?: string) => void;
  reorderPaneTabs: (paneId: string, fromId: string, toId: string) => void;
  placePaneTab: (paneId: string, tabId: string, beforeId: string | null) => void;
  /** Drag a shell/browser tab onto another pane — keeps the live session / URL. */
  movePaneTab: (fromPaneId: string, toPaneId: string, tabId: string) => void;
  /** Drag a tab to a pane edge to split, or center to merge. */
  dockPaneTab: (fromPaneId: string, toPaneId: string, tabId: string, zone: DropZone) => void;
  dockPane: (fromPaneId: string, toPaneId: string, zone: DropZone) => void;
  openBrowserWithUrl: (url: string) => Promise<void>;
  /** Open workspace folder in VS Code via `code serve-web` in a browser pane. */
  openWorkspaceInVsCodeInline: (folder?: string) => Promise<void>;
  /** When on, Space app hotkeys over an inline VS Code browser tab. */
  browserFocusMode: boolean;
  setBrowserFocusMode: (on: boolean) => void;
  toggleBrowserFocusMode: () => void;
  /** Focus mode is armed and the focused surface is a serve-web VS Code URL. */
  isVsCodeFocusActive: boolean;
  /** When true, reopen agent tabs with native resume CLIs (cmux-style). */
  autoResumeAgents: boolean;
  setAutoResumeAgents: (on: boolean) => void;
  suggestedLocalUrl: string | null;
  suggestPreviewUrl: (url: string) => void;
  dismissSuggestedLocalUrl: () => void;
  preferredShell: string;
  setPreferredShell: (shell: string) => void;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  t: (key: MsgKey) => string;
  agentAvailability: AgentAvailability;
  agentsScanned: boolean;
  refreshAgents: () => Promise<void>;
  error: string;
  setError: (msg: string) => void;
  isBusy: boolean;
  enterSpace: (opts: EnterSpaceOptions) => Promise<void>;
  /** @deprecated Use showWelcomeScreen — kept for callers. */
  resetOnboarding: () => void | Promise<void>;
  selectWorkspace: (id: string) => void;
  createWorkspace: (opts: CreateWorkspaceOptions) => Promise<void>;
  updateWorkspace: (
    id: string,
    patch: Partial<Pick<Workspace, "name" | "cwd" | "color" | "shellPresets" | "pinned">>,
  ) => Promise<void>;
  toggleWorkspacePinned: (id: string) => void;
  removeWorkspace: (id: string) => Promise<void>;
  refreshBranch: (id: string) => Promise<void>;
  focusPane: (paneId: string) => void;
  swapPanes: (fromPaneId: string, toPaneId: string) => void;
  applySnapLayout: (id: SnapLayoutId, primaryPaneId?: string) => Promise<void>;
  /** Drop a pane or tab onto a snap layout — extracts a tab first when needed. */
  snapDragToLayout: (id: SnapLayoutId, fromPaneId: string, tabId?: string) => void;
  spawnInPane: (opts: SpawnOptions) => Promise<string | null>;
  spawnInFocused: (opts: SpawnOptions) => Promise<string | null>;
  spawnAllEmpty: () => Promise<void>;
  launchAgent: (opts: SpawnOptions) => Promise<string | null>;
  /** Splits and returns the new pane id (needed to target it without a re-render). */
  splitFocused: (direction: SplitDirection, paneId?: string) => Promise<string | null>;
  /** Split a new shell onto an edge of the pane. */
  splitShellAt: (paneId: string, zone: Exclude<DropZone, "center">) => Promise<void>;
  /** Route Finder / clipboard file drop onto a pane zone (cmux-style). */
  handleFileDropAt: (
    paneId: string,
    zone: DropZone | "chat",
    pastePayload: string,
    opts?: { shiftKey?: boolean; rawPaths?: string[] },
  ) => Promise<void>;
  /** Open image/media preview in the pane (or split zone) where it was dropped. */
  openMediaPreviewAt: (paneId: string, zone: DropZone, absPath: string) => void;
  clearPaneMedia: (paneId: string) => void;
  takePendingSessionPaste: (sessionId: string) => string | null;
  savedLayouts: SavedWorkspaceLayout[];
  saveCurrentLayoutAs: (name: string) => void;
  removeSavedLayout: (id: string) => void;
  applySavedLayout: (id: string) => Promise<void>;
  openNewSpaceFromLayout: (id: string) => Promise<void>;
  closeFocusedPane: () => Promise<void>;
  closePane: (paneId: string) => Promise<void>;
  closeSession: (sessionId: string) => Promise<void>;
  /** Close one tab; if it is the last surface in the pane, close the pane. */
  closePaneSurface: (paneId: string, tabId: string) => Promise<void>;
  /** Close the focused surface (tab), not the whole pane tree. */
  closeFocusedTab: () => Promise<void>;
  equalizeSplits: () => void;
  toggleMaximizeFocusedPane: () => void;
  maximizedPaneId: string | null;
  flashPaneId: string | null;
  moveWorkspaceToTop: (id: string) => void;
  /** cmux "Fork Conversation to…" — branch a live agent thread, optionally from another pane/tab. */
  forkFocused: (where: ForkTarget, sourcePaneId?: string, sourceTabId?: string) => Promise<void>;
  /** Reopen last closed terminal / browser / workspace (Ctrl+Shift+T). */
  reopenClosed: () => Promise<boolean>;
  canReopenClosed: boolean;
  /** Browser-style focus history. */
  goFocusBack: () => boolean;
  goFocusForward: () => boolean;
  canFocusBack: boolean;
  canFocusForward: boolean;
  renameSession: (sessionId: string, title: string) => void;
  activatePaneSession: (paneId: string, sessionId: string) => void;
  restartSession: (sessionId: string) => Promise<void>;
  clearAttention: (sessionId: string) => void;
  /** Jump to newest unread (Ctrl+Shift+U). */
  focusNextAttention: () => boolean;
  /** Open a specific unread item from the notification menu. */
  focusAttention: (target: {
    workspaceId: string;
    paneId: string;
    sessionId: string;
  }) => boolean;
  /** Snapshot of unread attention items, newest first. */
  listAttention: () => Array<{
    workspaceId: string;
    workspaceName: string;
    paneId: string;
    sessionId: string;
    title: string;
    reason: string;
    at: number;
  }>;
  /** Clear every unread attention flag. */
  clearAllAttention: () => void;
  setSplitRatio: (splitId: string, ratio: number) => void;
  /**
   * Recent agent runs, newest first.
   */
  agentRuns: AgentRun[];
  /** Resumes the run inside its workspace, then navigates to the space view. */
  resumeAgentRun: (run: AgentRun, opts?: { paneId?: string; forceNew?: boolean }) => Promise<void>;
  /** Drop a history run onto a pane (live dock or resume). */
  resumeAgentRunAtDrop: (run: AgentRun, anchorPaneId: string, zone: DropZone) => Promise<void>;
  removeAgentRun: (id: string) => void;
  clearAgentRuns: () => void;
};

const SpaceContext = createContext<SpaceContextValue | null>(null);

type ViewContextValue = {
  view: ViewId;
  setView: (view: ViewId) => void;
};

const ViewContext = createContext<ViewContextValue | null>(null);

function hydrateLayout(raw: unknown, savedSessions: Record<string, unknown> = {}): SplitNode {
  if (!raw || typeof raw !== "object") return createLeaf(null);
  const node = raw as Record<string, unknown>;
  if (node.type === "leaf" && typeof node.paneId === "string") {
    const rawTabs = Array.isArray(node.browserTabs)
      ? node.browserTabs
          .filter(
            (t): t is { id: string } =>
              Boolean(t && typeof t === "object" && typeof (t as { id?: unknown }).id === "string"),
          )
          .map((t) => ({ id: t.id, url: "" }))
      : [];
    const hadBrowser =
      node.kind === "browser" ||
      typeof node.browserUrl === "string" ||
      rawTabs.length > 0 ||
      (Array.isArray(node.tabOrder) &&
        node.tabOrder.some(
          (id) =>
            typeof id === "string" && (id === "__browser__" || id.startsWith("__browser__:")),
        ));
    const browserTabs = rawTabs.length
      ? rawTabs
      : hadBrowser
        ? [{ id: "legacy", url: "" }]
        : [];
    const kind: "terminal" | "browser" | "media" =
      node.kind === "media" ||
      (typeof node.mediaPath === "string" && node.mediaPath) ||
      (Array.isArray(node.tabOrder) && node.tabOrder.includes("__media__"))
        ? "media"
        : browserTabs.length || node.kind === "browser"
          ? "browser"
          : "terminal";
    return {
      type: "leaf",
      paneId: node.paneId,
      kind,
      sessionId:
        typeof node.sessionId === "string" && savedSessions[node.sessionId]
          ? node.sessionId
          : null,
      sessionIds: Array.isArray(node.sessionIds)
        ? node.sessionIds.filter((id): id is string => typeof id === "string" && Boolean(savedSessions[id]))
        : typeof node.sessionId === "string" && savedSessions[node.sessionId]
          ? [node.sessionId]
          : [],
      tabOrder: Array.isArray(node.tabOrder)
        ? node.tabOrder.filter((id): id is string => typeof id === "string")
        : undefined,
      // Keep browser tab slots; never restore the last URL.
      browserUrl: browserTabs.length ? "" : null,
      browserTabs: browserTabs.length ? browserTabs : undefined,
      activeBrowserId:
        typeof node.activeBrowserId === "string" &&
        browserTabs.some((t) => t.id === node.activeBrowserId)
          ? node.activeBrowserId
          : browserTabs[browserTabs.length - 1]?.id ?? null,
      mediaPath: typeof node.mediaPath === "string" ? node.mediaPath : null,
    };
  }
  if (node.type === "split" && node.first && node.second) {
    return clampLayoutRatios({
      type: "split",
      id: typeof node.id === "string" ? node.id : uid("split"),
      direction: node.direction === "v" ? "v" : "h",
      ratio: typeof node.ratio === "number" ? node.ratio : 0.5,
      first: hydrateLayout(node.first, savedSessions),
      second: hydrateLayout(node.second, savedSessions),
    });
  }
  return createLeaf(null);
}

export function SpaceProvider({ children }: { children: ReactNode }) {
  const persisted = useMemo(() => loadPersisted(), []);
  const [skipWelcome, setSkipWelcomeState] = useState(() => persisted?.skipWelcome === true);
  // Welcome only when there is nothing to restore — existing spaces open instantly.
  const [welcomeVisible, setWelcomeVisible] = useState(() => {
    if (persisted?.skipWelcome === true) return false;
    if (persisted?.workspaces?.length) return false;
    return true;
  });
  const [onboarded, setOnboarded] = useState(() => Boolean(persisted?.onboarded));
  const [view, setViewState] = useState<ViewId>("space");
  const viewRef = useRef<ViewId>("space");
  const viewTransitionRef = useRef(0);
  const pendingPaneSpawnsRef = useRef(new Map<string, SpawnOptions>());
  const pendingPaneSpawnQueuesRef = useRef(new Map<string, SpawnOptions[]>());
  const pendingSessionPasteRef = useRef(new Map<string, string>());
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    if (persisted?.workspaces?.length) {
      return persisted.workspaces.map((w, index) => {
        const layout = hydrateLayout(w.layout, persisted.sessions ?? {});
        const focusedPaneId = findLeaf(layout, w.focusedPaneId)
          ? w.focusedPaneId
          : firstPaneId(layout);
        return {
          id: w.id,
          name: w.name,
          cwd: w.cwd,
          branch: w.branch ?? null,
          color: isSpaceColor(w.color) ? w.color : SPACE_COLORS[index % SPACE_COLORS.length],
          layout,
          focusedPaneId,
          pinned: Boolean(w.pinned),
          shellPresets: hydrateShellPresets(w.shellPresets),
        };
      });
    }
    return [];
  });
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    () => persisted?.activeWorkspaceId ?? null,
  );
  const workspacesRef = useRef(workspaces);
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  workspacesRef.current = workspaces;
  activeWorkspaceIdRef.current = activeWorkspaceId;
  const [sessions, setSessions] = useState<Record<string, TerminalSession>>(() =>
    Object.fromEntries(
      Object.entries(persisted?.sessions ?? {}).map(([id, session]) => [id, {
        id,
        title: session.title,
        cwd: session.cwd,
        shell: session.shell,
        accent: session.accent,
        initialCommand: session.initialCommand,
        resumeCommand: session.resumeCommand,
        agentId: session.agentId,
        status: "closed" as const,
        needsAttention: false,
      }]),
    ),
  );
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  // Only sessions loaded from disk auto-reopen; manually closed tabs stay closed.
  const restorePendingIdsRef = useRef(new Set(Object.keys(persisted?.sessions ?? {})));
  const closedStackRef = useRef<ClosedSurface[]>([]);
  const focusTrailRef = useRef<FocusPoint[]>([]);
  const focusIndexRef = useRef(-1);
  const suppressFocusNavRef = useRef(false);
  const [navFlags, setNavFlags] = useState({
    reopen: false,
    back: false,
    forward: false,
  });
  const [maximizedPaneId, setMaximizedPaneId] = useState<string | null>(null);
  const [flashPaneId, setFlashPaneId] = useState<string | null>(null);
  const flashTimerRef = useRef(0);
  const syncNavFlags = useCallback(() => {
    setNavFlags({
      reopen: closedStackRef.current.length > 0,
      back: focusIndexRef.current > 0,
      forward: focusIndexRef.current < focusTrailRef.current.length - 1,
    });
  }, []);
  const rememberClosed = useCallback(
    (item: ClosedSurface) => {
      closedStackRef.current = pushClosed(closedStackRef.current, item);
      syncNavFlags();
    },
    [syncNavFlags],
  );
  const rememberFocusPoint = useCallback(
    (point: FocusPoint) => {
      if (suppressFocusNavRef.current) return;
      if (!point.workspaceId) return;
      const { trail, index } = pushFocus(
        focusTrailRef.current,
        focusIndexRef.current,
        point,
      );
      focusTrailRef.current = trail;
      focusIndexRef.current = index;
      syncNavFlags();
    },
    [syncNavFlags],
  );
  const [recentHistory, setRecentHistory] = useState<HistoryItem[]>(
    () => persisted?.recentHistory ?? [],
  );
  const [savedLayouts, setSavedLayouts] = useState<SavedWorkspaceLayout[]>(() =>
    normalizeSavedLayouts(persisted?.savedLayouts),
  );
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>(() => persisted?.agentRuns ?? []);
  const [autoResumeAgents, setAutoResumeAgentsState] = useState(() => loadAutoResumeAgents());
  const setAutoResumeAgents = useCallback((on: boolean) => {
    setAutoResumeAgentsState(on);
    saveAutoResumeAgents(on);
  }, []);
  // Always start blank — never auto-open a saved site (store.ql, vercel, etc.).
  const [browserUrl, setBrowserUrl] = useState("");
  const [browserFocusMode, setBrowserFocusMode] = useState(false);
  const [suggestedLocalUrl, setSuggestedLocalUrl] = useState<string | null>(null);
  const lastSuggestedUrlRef = useRef<string | null>(null);
  const [preferredShell, setPreferredShell] = useState(() => persisted?.preferredShell ?? "");
  const [locale, setLocale] = useState<Locale>(() =>
    persisted?.locale === "en" || persisted?.locale === "ru" ? persisted.locale : "en",
  );
  const [theme, setThemeState] = useState<ThemeId>(() =>
    resolveThemeId(persisted?.theme),
  );
  const setTheme = useCallback((next: ThemeId) => setThemeState(resolveThemeId(next)), []);
  const t = useCallback((key: MsgKey) => translate(locale, key), [locale]);

  const setView = useCallback((next: ViewId) => {
    const current = viewRef.current;
    if (current === next) return;
    ++viewTransitionRef.current;
    viewRef.current = next;
    startTransition(() => {
      setViewState(next);
    });
  }, []);

  const takePendingPaneSpawn = useCallback((paneId: string) => {
    return pendingPaneSpawnsRef.current.get(paneId) ?? null;
  }, []);

  const takePendingPaneSpawnQueue = useCallback((paneId: string) => {
    const queue = pendingPaneSpawnQueuesRef.current.get(paneId);
    if (queue?.length) {
      pendingPaneSpawnQueuesRef.current.delete(paneId);
      return queue;
    }
    const single = pendingPaneSpawnsRef.current.get(paneId);
    if (single) {
      pendingPaneSpawnsRef.current.delete(paneId);
      return [single];
    }
    return [];
  }, []);

  const clearPendingPaneSpawn = useCallback((paneId: string) => {
    pendingPaneSpawnsRef.current.delete(paneId);
  }, []);

  const takePendingSessionPaste = useCallback((sessionId: string) => {
    const payload = pendingSessionPasteRef.current.get(sessionId) ?? null;
    if (payload) pendingSessionPasteRef.current.delete(sessionId);
    return payload;
  }, []);
  const [agentAvailability, setAgentAvailability] = useState<AgentAvailability>({});
  const [agentsScanned, setAgentsScanned] = useState(false);
  const [companionRunning, setCompanionRunning] = useState(false);
  const [error, setError] = useState("");
  const [isBusy] = useState(false);

  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    void syncWindowGlass(theme);
  }, [theme]);

  const setSkipWelcome = useCallback((skip: boolean) => {
    setSkipWelcomeState(skip);
    if (skip) setWelcomeVisible(false);
  }, []);

  const dismissWelcome = useCallback(() => {
    setWelcomeVisible(false);
    setOnboarded(true);
    setView("space");
  }, [setView]);

  const showWelcomeScreen = useCallback(() => {
    setSkipWelcomeState(false);
    setWelcomeVisible(true);
  }, []);

  const persistReadyRef = useRef(false);

  useEffect(() => {
    if (!persistReadyRef.current) {
      persistReadyRef.current = true;
      return;
    }
    savePersisted({
      onboarded,
      skipWelcome,
      workspaces: workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        cwd: w.cwd,
        branch: w.branch,
        color: w.color,
        layout: w.layout,
        focusedPaneId: w.focusedPaneId,
        pinned: Boolean(w.pinned),
        shellPresets: w.shellPresets ?? [],
      })),
      activeWorkspaceId: activeWorkspace?.id ?? null,
      browserUrl: "",
      preferredShell,
      locale,
      theme,
      recentHistory,
      agentRuns,
      sessions: Object.fromEntries(
        Object.entries(sessions).map(([id, session]) => [id, {
          title: session.title,
          cwd: session.cwd,
          shell: session.shell,
          accent: session.accent,
          initialCommand: session.initialCommand,
          resumeCommand: session.resumeCommand,
          agentId: session.agentId,
        }]),
      ),
      savedLayouts,
    });
  }, [
    onboarded,
    skipWelcome,
    workspaces,
    activeWorkspace?.id,
    browserUrl,
    preferredShell,
    locale,
    theme,
    recentHistory,
    agentRuns,
    sessions,
    savedLayouts,
  ]);

  useEffect(() => {
    const onHide = () => flushPersisted();
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
      flushPersisted();
    };
  }, []);

  const refreshAgents = useCallback(async () => {
    try {
      const map = await checkCommands(commandKeysForBots());
      setAgentAvailability(map);
      setAgentsScanned(true);
    } catch {
      // Keep last known map — never mark everything missing/installed on a scan glitch.
    }
  }, []);

  // Defer PATH scan until after terminals have room to start.
  useEffect(() => {
    if (welcomeVisible) return;
    const id = window.setTimeout(() => {
      void refreshAgents();
    }, 5500);
    return () => window.clearTimeout(id);
  }, [refreshAgents, welcomeVisible]);

  const patchWorkspace = useCallback((id: string, updater: (ws: Workspace) => Workspace) => {
    setWorkspaces((current) => {
      const next = current.map((ws) => (ws.id === id ? updater(ws) : ws));
      // Keep ref in sync for spawn/resume before the next React render.
      workspacesRef.current = next;
      return next;
    });
  }, []);

  /** Refcount of panes that must stay empty until resume/spawn finishes (no surprise Shell). */
  const emptySpawnHoldRef = useRef(new Map<string, number>());
  const [emptyPaneSpawnEpoch, setEmptyPaneSpawnEpoch] = useState(0);
  const holdEmptyPaneSpawn = useCallback((paneId: string) => {
    const map = emptySpawnHoldRef.current;
    map.set(paneId, (map.get(paneId) ?? 0) + 1);
  }, []);
  const releaseEmptyPaneSpawn = useCallback((paneId: string) => {
    const map = emptySpawnHoldRef.current;
    const next = (map.get(paneId) ?? 0) - 1;
    if (next <= 0) {
      map.delete(paneId);
      setEmptyPaneSpawnEpoch((n) => n + 1);
    } else {
      map.set(paneId, next);
    }
  }, []);
  const isEmptyPaneSpawnHeld = useCallback((paneId: string) => {
    return (emptySpawnHoldRef.current.get(paneId) ?? 0) > 0;
  }, []);
  const shouldAutoSpawnShell = useCallback((paneId: string) => {
    if ((emptySpawnHoldRef.current.get(paneId) ?? 0) > 0) return false;
    const wsId = activeWorkspaceIdRef.current;
    const ws = workspacesRef.current.find((w) => w.id === wsId);
    if (!ws) return false;
    const leaf = findLeaf(ws.layout, paneId);
    if (!leaf) return false;
    if (leaf.kind === "browser" || leaf.kind === "media") return false;
    if (leaf.mediaPath || leafHasBrowser(leaf)) return false;
    return leafTabIds(leaf).length === 0;
  }, []);

  const isSessionFocused = useCallback((sessionId: string) => {
    const wsId = activeWorkspaceIdRef.current;
    const ws = workspacesRef.current.find((w) => w.id === wsId);
    if (!ws) return false;
    const leaf = findLeaf(ws.layout, ws.focusedPaneId);
    if (!leaf) return false;
    return leaf.sessionId === sessionId || leafTabIds(leaf).includes(sessionId);
  }, []);

  const workspaceForSession = useCallback((sessionId: string) => {
    for (const ws of workspacesRef.current) {
      if (findPaneForSession(ws.layout, sessionId)) return ws.id;
    }
    return null;
  }, []);

  const markAttention = useCallback(
    (sessionId: string, reason?: string) => {
      let shouldNotify = false;
      let title = "Shell";
      setSessions((current) => {
        const session = current[sessionId];
        if (!session) return current;
        stampAttention(sessionId);
        if (session.needsAttention) return current;
        shouldNotify = true;
        title = session.title || "Shell";
        return { ...current, [sessionId]: { ...session, needsAttention: true } };
      });
      // Already unread: still refresh stamp so Cmd+Shift+U hits the newest raise.
      if (!shouldNotify) {
        stampAttention(sessionId);
        if (reason) {
          notifyAttention({
            sessionId,
            workspaceId: workspaceForSession(sessionId),
            activeWorkspaceId: activeWorkspaceIdRef.current,
            isFocusedSession: true,
            reason,
            title,
          });
        }
        return;
      }

      const workspaceId = workspaceForSession(sessionId);
      notifyAttention({
        sessionId,
        workspaceId,
        activeWorkspaceId: activeWorkspaceIdRef.current,
        isFocusedSession: isSessionFocused(sessionId),
        reason,
        title,
      });
    },
    [isSessionFocused, workspaceForSession],
  );

  useEffect(() => {
    void companionStatus()
      .then((status) => {
        const live = Boolean(status.running);
        setCompanionLive(live);
        setCompanionRunning(live);
      })
      .catch(() => {
        setCompanionLive(false);
        setCompanionRunning(false);
      });
  }, []);

  useEffect(() => {
    const unlistenOutput = listen<TerminalOutputEvent>("terminal://output", (event) => {
      const sessionId = event.payload.id;
      const data = event.payload.data;
      if (isCompanionLive()) {
        void companionAppendOutput(sessionId, data).catch(() => undefined);
      }

      if (shouldScanOutputForAttention(sessionId) && outputNeedsAttention(data)) {
        markAttention(sessionId, "Task finished or waiting for input");
      }

      const session = sessionsRef.current[sessionId];
      if (!session || !isIdleShellTitle(session.title)) return;
      if (session.agentId && session.agentId !== "shell") return;

      const agentId = detectAgentFromOutput(data);
      if (!agentId) return;

      const bot = agentBots.find((b) => b.id === agentId);
      if (!bot) return;

      setSessions((current) => {
        const s = current[sessionId];
        if (!s || !isIdleShellTitle(s.title)) return current;
        return {
          ...current,
          [sessionId]: {
            ...s,
            title: bot.name,
            initialCommand: bot.command,
            accent: bot.accent,
            agentId: bot.id,
          },
        };
      });
      for (const ws of workspacesRef.current) {
        const pane = findPaneForSession(ws.layout, sessionId);
        if (!pane) continue;
        setAgentRuns((current) => {
          if (current.some((run) => run.sessionId === sessionId && run.agentId === bot.id)) {
            return current;
          }
          return [
            {
              id: uid("run"),
              at: Date.now(),
              agentId: bot.id,
              agentName: bot.name,
              workspaceId: ws.id,
              workspaceName: ws.name,
              cwd: ws.cwd,
              command: bot.command,
              shell: bot.shell ?? null,
              accent: bot.accent,
              sessionId,
              paneId: pane,
            },
            ...current,
          ].slice(0, MAX_AGENT_RUNS);
        });
        break;
      }
    });
    const unlistenExit = listen<TerminalExitEvent>("terminal://exit", (event) => {
      const sessionId = event.payload.id;
      let title = "Shell";
      setSessions((current) => {
        const session = current[sessionId];
        if (!session) return current;
        title = session.title || "Shell";
        stampAttention(sessionId);
        return {
          ...current,
          [sessionId]: { ...session, status: "closed", needsAttention: true },
        };
      });
      notifySessionExit({
        sessionId,
        workspaceId: workspaceForSession(sessionId),
        activeWorkspaceId: activeWorkspaceIdRef.current,
        isFocusedSession: isSessionFocused(sessionId),
        title,
      });
    });
    const unlistenAttention = listen<{ id: string }>("terminal://attention", (event) => {
      markAttention(event.payload.id);
    });
    return () => {
      void unlistenOutput.then((u) => u());
      void unlistenExit.then((u) => u());
      void unlistenAttention.then((u) => u());
    };
  }, [markAttention, isSessionFocused, workspaceForSession]);

  const pushHistory = useCallback((item: Omit<HistoryItem, "at"> & { at?: number }) => {
    const entry: HistoryItem = { ...item, at: item.at ?? Date.now() };
    setRecentHistory((current) => {
      const last = current[0];
      if (
        last &&
        last.workspaceId === entry.workspaceId &&
        entry.at - last.at < 4000
      ) {
        return current;
      }
      return [entry, ...current].slice(0, MAX_HISTORY);
    });
  }, []);

  const clearHistory = useCallback(() => setRecentHistory([]), []);

  const removeHistoryItem = useCallback((workspaceId: string, at: number) => {
    setRecentHistory((current) =>
      current.filter((item) => !(item.workspaceId === workspaceId && item.at === at)),
    );
  }, []);

  const recordAgentRun = useCallback((run: Omit<AgentRun, "id" | "at">) => {
    const entry: AgentRun = { ...run, id: uid("run"), at: Date.now() };
    setAgentRuns((current) => {
      const last = current[0];
      if (
        last &&
        last.agentId === entry.agentId &&
        last.workspaceId === entry.workspaceId &&
        entry.at - last.at < 5000 &&
        last.sessionId === entry.sessionId
      ) {
        return current;
      }
      return [entry, ...current].slice(0, MAX_AGENT_RUNS);
    });
  }, []);

  const touchAgentRun = useCallback((runId: string, patch: Partial<Pick<AgentRun, "sessionId" | "paneId" | "at">>) => {
    setAgentRuns((current) =>
      current.map((run) => (run.id === runId ? { ...run, ...patch, at: patch.at ?? Date.now() } : run)),
    );
  }, []);

  const selectWorkspace = useCallback(
    (id: string) => {
      setMaximizedPaneId(null);
      setActiveWorkspaceId(id);
      setWorkspaces((current) => {
        const target = current.find((ws) => ws.id === id);
        if (target) {
          pushHistory({
            workspaceId: target.id,
            workspaceName: target.name,
            cwd: target.cwd,
          });
          rememberFocusPoint({ workspaceId: target.id, paneId: target.focusedPaneId });
        }
        return current;
      });
      setViewState("space");
    },
    [pushHistory, rememberFocusPoint],
  );

  const createWorkspaceInternal = useCallback(
    async (opts: CreateWorkspaceOptions): Promise<Workspace> => {
      const grid = resolveGrid(opts);
      let layout = buildCreateLayout(grid, Boolean(opts.includeBrowser));
      const terminalPrefs = loadTerminalPrefs();
      const setupCommand = terminalPrefs.setupScriptCommand.trim();
      let setupPaneId: string | null = null;
      if (setupCommand && terminalPrefs.setupScriptLocation !== "tab" && countLeaves(layout) < 8) {
        const anchorPaneId = collectLeaves(layout).find((leaf) => leaf.kind !== "browser")?.paneId;
        const added = anchorPaneId
          ? addShellBeside(layout, anchorPaneId, terminalPrefs.setupScriptLocation === "vertical" ? "h" : "v")
          : null;
        if (added) {
          layout = added.layout;
          setupPaneId = added.paneId;
        }
      }
      queuePaneSpawns(
        pendingPaneSpawnsRef.current,
        layout,
        opts.agentIds,
        agentAvailability,
      );
      // Seeds must be staged before the layout is mounted, otherwise the pane
      // consumes the default idle-Shell spawn first.
      const seedPane = firstPaneId(layout);
      if (seedPane && opts.seedBrowserUrl?.trim()) {
        pendingPaneSpawnsRef.current.delete(seedPane);
        layout = setLeafBrowser(openBrowserTab(layout, seedPane), seedPane, opts.seedBrowserUrl);
      } else if (seedPane && opts.seedSpawn) {
        pendingPaneSpawnsRef.current.set(seedPane, { ...opts.seedSpawn, paneId: seedPane });
      }
      if (setupCommand) {
        const targetPaneId = setupPaneId ?? collectLeaves(layout).find((leaf) => leaf.kind !== "browser")?.paneId;
        if (targetPaneId) {
          const setupSpawn = { title: "Setup", command: setupCommand, accent: "green" as const, agentId: "shell", paneId: targetPaneId, background: true };
          if (setupPaneId) {
            pendingPaneSpawnsRef.current.set(targetPaneId, setupSpawn);
          } else {
            const initialSpawn = pendingPaneSpawnsRef.current.get(targetPaneId) ?? { title: "Shell", accent: "green" as const, agentId: "shell", paneId: targetPaneId };
            pendingPaneSpawnQueuesRef.current.set(targetPaneId, [initialSpawn, setupSpawn]);
            pendingPaneSpawnsRef.current.delete(targetPaneId);
          }
        }
      }
      let branch: string | null = opts.branch ?? null;
      const cwd = opts.cwd.trim();
      if (cwd && opts.branch === undefined) {
        try {
          branch = await getGitBranch(cwd);
        } catch {
          branch = null;
        }
      }
      const ws: Workspace = {
        id: uid("ws"),
        name: opts.name.trim() || "Space",
        cwd,
        branch,
        color: pickSpaceColor(workspaces, opts.color),
        layout,
        focusedPaneId: firstPaneId(layout),
        pinned: false,
        shellPresets: [],
      };
      setWorkspaces((current) => [...current, ws]);
      setActiveWorkspaceId(ws.id);
      setOnboarded(true);
      setView("space");
      pushHistory({
        workspaceId: ws.id,
        workspaceName: ws.name,
        cwd: ws.cwd,
      });
      return ws;
    },
    [agentAvailability, pushHistory, setView, workspaces],
  );

  const createWorkspace = useCallback(
    async (opts: CreateWorkspaceOptions) => {
      await createWorkspaceInternal(opts);
    },
    [createWorkspaceInternal],
  );

  const spawnInPane = useCallback(
    async (opts: SpawnOptions) => {
      const workspace =
        (opts.workspaceId && workspacesRef.current.find((w) => w.id === opts.workspaceId)) ||
        activeWorkspace;
      if (!workspace) return null;
      const paneId = opts.paneId ?? workspace.focusedPaneId;
      const leaf = findLeaf(workspace.layout, paneId);
      if (!leaf) return null;

      const existingTabs = leafTabIds(leaf);
      const asTab = opts.mode === "tab" || (opts.mode !== "replace" && existingTabs.length > 0);

      setError("");
      try {
        const shell = opts.shell ?? (preferredShell.trim() || null);
        const created = await enqueueTerminalSpawn(() =>
          createTerminalSession({
            cwd: workspace.cwd || null,
            shell,
            title: opts.title,
            cols: PTY_COLS,
            rows: PTY_ROWS,
            initialCommand: opts.command?.trim() || null,
          }),
        );
        const agentId = opts.agentId ?? agentIdFromCommand(opts.command) ?? "shell";
        const bot = agentBots.find((b) => b.id === agentId);
        const resumeCommand =
          agentId !== "shell"
            ? resumeCommandFor(bot, opts.command, agentAvailability) ?? undefined
            : undefined;
        const session: TerminalSession = {
          id: created.id,
          title: created.title,
          cwd: created.cwd || workspace.cwd,
          shell: created.shell,
          status: "online",
          accent: opts.accent ?? "green",
          needsAttention: false,
          initialCommand: opts.command?.trim() || undefined,
          resumeCommand,
          agentId,
        };
        setSessions((current) => {
          const next = { ...current, [session.id]: session };
          if (!asTab) {
            for (const id of existingTabs) {
              if (id === session.id) continue;
              void killTerminalSession(id).catch(() => undefined);
              delete next[id];
            }
          }
          return next;
        });
        patchWorkspace(workspace.id, (ws) => ({
          ...ws,
          layout: asTab
            ? activateLeafSession(
                addLeafSession(ws.layout, paneId, session.id),
                paneId,
                opts.background ? leaf?.sessionId ?? session.id : session.id,
              )
            : setLeafSession(ws.layout, paneId, session.id),
          focusedPaneId: paneId,
        }));
        if (opts.paste?.trim()) {
          window.setTimeout(() => {
            void writeTerminalSession(created.id, opts.paste!).catch(() => undefined);
          }, 80);
        }
        // Soft-attach a vault session id later (non-blocking) so reboot can resume that exact chat.
        if (agentId !== "shell") {
          const attachId = created.id;
          const attachCwd = session.cwd;
          window.setTimeout(() => {
            void lookupVaultResumeCommand(agentId, attachCwd).then((vaultResume) => {
              if (!vaultResume) return;
              setSessions((current) => {
                const live = current[attachId];
                if (!live) return current;
                if (live.resumeCommand === vaultResume) return current;
                return {
                  ...current,
                  [attachId]: { ...live, resumeCommand: vaultResume },
                };
              });
            });
          }, 4500);
        }
        return created.id;
      } catch (err) {
        setError(clientError(err));
        return null;
      }
    },
    [activeWorkspace, agentAvailability, patchWorkspace, preferredShell],
  );

  const activatePaneSession = useCallback(
    (paneId: string, sessionId: string) => {
      if (!activeWorkspace) return;
      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        layout: activateLeafSession(ws.layout, paneId, sessionId),
        focusedPaneId: paneId,
      }));
      setSessions((current) => {
        const session = current[sessionId];
        if (!session?.needsAttention) return current;
        return { ...current, [sessionId]: { ...session, needsAttention: false } };
      });
    },
    [activeWorkspace, patchWorkspace],
  );

  const spawnInFocused = useCallback(
    (opts: SpawnOptions) => spawnInPane(opts),
    [spawnInPane],
  );

  const spawnAllEmpty = useCallback(async () => {
    if (!activeWorkspace) return;
    const panes = collectPaneIds(activeWorkspace.layout);
    await Promise.all(
      panes.map(async (paneId) => {
        const leaf = findLeaf(activeWorkspace.layout, paneId);
        if (!leaf) return;
        if (leaf.kind === "browser" || leaf.kind === "media") return;
        if (leaf.mediaPath || leafHasBrowser(leaf)) return;
        if (leafTabIds(leaf).length > 0) return;
        await yieldToUi(0);
        await spawnInPane({ title: "Shell", paneId, accent: "green", mode: "replace" });
      }),
    );
  }, [activeWorkspace, spawnInPane]);

  const setPaneBrowserUrl = useCallback(
    (paneId: string, url: string, tabKey?: string) => {
      if (!activeWorkspace) return;
      setBrowserUrl(url);
      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        layout: setLeafBrowser(ws.layout, paneId, url, tabKey),
      }));
    },
    [activeWorkspace, patchWorkspace],
  );

  const focusTerminalInPane = useCallback(
    async (targetPaneId?: string) => {
      if (!activeWorkspace) return;
      const paneId = targetPaneId ?? activeWorkspace.focusedPaneId;
      const leaf = findLeaf(activeWorkspace.layout, paneId);
      if (!leaf) return;
      const tabs = leafTabIds(leaf);
      if (tabs.length > 0) {
        const sessionId =
          leaf.sessionId && tabs.includes(leaf.sessionId) ? leaf.sessionId : tabs[0]!;
        patchWorkspace(activeWorkspace.id, (ws) => ({
          ...ws,
          layout: activateLeafSession(ws.layout, paneId, sessionId),
          focusedPaneId: paneId,
        }));
        setView("space");
        return;
      }
      await spawnInPane({
        title: "Shell",
        paneId,
        mode: "tab",
        accent: "green",
      });
      setView("space");
    },
    [activeWorkspace, patchWorkspace, spawnInPane],
  );

  const reorderPaneTabs = useCallback(
    (paneId: string, fromId: string, toId: string) => {
      if (!activeWorkspace || fromId === toId) return;
      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        layout: reorderLeafTabs(ws.layout, paneId, fromId, toId),
        focusedPaneId: paneId,
      }));
    },
    [activeWorkspace, patchWorkspace],
  );

  const placePaneTab = useCallback(
    (paneId: string, tabId: string, beforeId: string | null) => {
      if (!activeWorkspace) return;
      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        layout: placeLeafTab(ws.layout, paneId, tabId, beforeId),
        focusedPaneId: paneId,
      }));
    },
    [activeWorkspace, patchWorkspace],
  );

  const focusBrowserInPane = useCallback(
    (targetPaneId?: string, tabKey?: string) => {
      if (!activeWorkspace) return;
      const paneId = targetPaneId ?? activeWorkspace.focusedPaneId;
      if (!findLeaf(activeWorkspace.layout, paneId)) return;
      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        layout: focusBrowserTab(ws.layout, paneId, tabKey),
        focusedPaneId: paneId,
      }));
      setView("space");
    },
    [activeWorkspace, patchWorkspace],
  );

  const focusMediaInPane = useCallback(
    (targetPaneId?: string) => {
      if (!activeWorkspace) return;
      const paneId = targetPaneId ?? activeWorkspace.focusedPaneId;
      const leaf = findLeaf(activeWorkspace.layout, paneId);
      if (!leaf?.mediaPath) return;
      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        layout: openMediaTab(ws.layout, paneId, leaf.mediaPath!),
        focusedPaneId: paneId,
      }));
      setView("space");
    },
    [activeWorkspace, patchWorkspace],
  );

  const openBrowserInFocused = useCallback(
    async (
      targetPaneId?: string,
      requestedMode: "beside" | "below" | "left" | "above" | "root" | "tab" = "tab",
    ) => {
      if (!activeWorkspace) return;
      const paneId = targetPaneId ?? activeWorkspace.focusedPaneId;
      const leaf = findLeaf(activeWorkspace.layout, paneId);
      if (!leaf) return;
      const mode = requestedMode;

      // Tab: open/focus browser in this pane (never auto-split — use edge modes for that).
      if (mode === "tab" || mode === undefined) {
        patchWorkspace(activeWorkspace.id, (ws) => ({
          ...ws,
          layout: openBrowserTab(ws.layout, paneId),
          focusedPaneId: paneId,
        }));
        setView("space");
        return;
      }

      if (countLeaves(activeWorkspace.layout) >= MAX_PANES) {
        setError(`You can open up to ${MAX_PANES} panes in one workspace.`);
        return;
      }

      const zone =
        mode === "left"
          ? "left"
          : mode === "above"
            ? "top"
            : mode === "below"
              ? "bottom"
              : mode === "beside"
                ? "right"
                : null;

      const added =
        mode === "root"
          ? addBrowserRoot(activeWorkspace.layout)
          : zone
            ? addBrowserAtZone(activeWorkspace.layout, paneId, zone)
            : addBrowserBeside(activeWorkspace.layout, paneId, "h");
      if (!added) return;

      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        layout: added.layout,
        focusedPaneId: added.paneId,
      }));
      setView("space");
    },
    [activeWorkspace, patchWorkspace],
  );

  const closeBrowserTabInPane = useCallback(
    (paneId: string, tabKey?: string) => {
      if (!activeWorkspace) return;
      const leaf = findLeaf(activeWorkspace.layout, paneId);
      if (!leaf) return;
      const browsers = normalizeBrowserTabs(leaf);
      const closingId =
        (tabKey && browserIdFromTabKey(tabKey)) ||
        leaf.activeBrowserId ||
        browsers[browsers.length - 1]?.id ||
        null;
      const closingKey = closingId ? makeBrowserTabKey(closingId) : undefined;
      const closingTab = browsers.find((t) => t.id === closingId);
      if (closingTab?.url.trim()) {
        rememberClosed({
          kind: "browser",
          workspaceId: activeWorkspace.id,
          url: closingTab.url,
        });
      }
      if (closingId) {
        void browserClose(`browser-${paneId}-${closingId}`).catch(() => undefined);
        if (closingId === "legacy") {
          void browserClose(`browser-${paneId}`).catch(() => undefined);
        }
      }
      const remaining = browsers.filter((t) => t.id !== closingId);
      const terminals = leafTabIds(leaf);
      if (remaining.length === 0 && terminals.length === 0 && !leafHasMedia(leaf)) {
        const next = removePane(activeWorkspace.layout, paneId);
        if (!next) return;
        patchWorkspace(activeWorkspace.id, (ws) => ({
          ...ws,
          layout: equalizeLayout(next),
          focusedPaneId: firstPaneId(next),
        }));
        return;
      }
      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        layout: closeBrowserTab(ws.layout, paneId, closingKey),
        focusedPaneId: paneId,
      }));
    },
    [activeWorkspace, patchWorkspace, rememberClosed],
  );

  const dockPaneTab = useCallback(
    (fromPaneId: string, toPaneId: string, tabId: string, zone: DropZone) => {
      if (!activeWorkspace) return;
      if (!findLeaf(activeWorkspace.layout, fromPaneId)) return;
      if (!findLeaf(activeWorkspace.layout, toPaneId)) return;
      patchWorkspace(activeWorkspace.id, (ws) => {
        const { layout, focusPaneId } = dockTab(ws.layout, fromPaneId, toPaneId, tabId, zone);
        return {
          ...ws,
          layout,
          focusedPaneId: findLeaf(layout, focusPaneId)?.paneId ?? firstPaneId(layout),
        };
      });
      setView("space");
    },
    [activeWorkspace, patchWorkspace],
  );

  const movePaneTab = useCallback(
    (fromPaneId: string, toPaneId: string, tabId: string) => {
      dockPaneTab(fromPaneId, toPaneId, tabId, "center");
    },
    [dockPaneTab],
  );

  const dockPane = useCallback(
    (fromPaneId: string, toPaneId: string, zone: DropZone) => {
      if (!activeWorkspace) return;
      if (fromPaneId === toPaneId) return;
      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        layout: movePane(ws.layout, fromPaneId, toPaneId, zone),
        focusedPaneId: fromPaneId,
      }));
    },
    [activeWorkspace, patchWorkspace],
  );

  const openBrowserWithUrl = useCallback(
    async (rawUrl: string) => {
      if (!activeWorkspace) return;
      const url = resolveOmniboxInput(rawUrl);
      if (!url) return;
      setBrowserUrl(url);
      setSuggestedLocalUrl(null);

      const focused = findLeaf(activeWorkspace.layout, activeWorkspace.focusedPaneId);
      if (focused) {
        patchWorkspace(activeWorkspace.id, (ws) => ({
          ...ws,
          layout: setLeafBrowser(openBrowserTab(ws.layout, focused.paneId), focused.paneId, url),
          focusedPaneId: focused.paneId,
        }));
        setView("space");
        return;
      }

      window.dispatchEvent(
        new CustomEvent("voxiva-assist-open", { detail: { tab: "browser", url } }),
      );
      setView("space");
    },
    [activeWorkspace, patchWorkspace],
  );

  const openWorkspaceInVsCodeInline = useCallback(
    async (folder?: string) => {
      if (!activeWorkspace) {
        setError(t("assist.needWorkspace"));
        return;
      }
      const cwd = (folder ?? activeWorkspace.cwd).trim();
      if (!cwd) {
        setError(t("vscode.needFolder"));
        return;
      }
      try {
        setError(t("vscode.starting"));
        const url = await vscodeServeWebFolderUrl(cwd);
        setBrowserUrl(url);
        setSuggestedLocalUrl(null);
        setBrowserFocusMode(true);

        const focused = findLeaf(activeWorkspace.layout, activeWorkspace.focusedPaneId);
        if (focused && leafHasBrowser(focused)) {
          if (countLeaves(activeWorkspace.layout) >= MAX_PANES) {
            setError(`You can open up to ${MAX_PANES} panes in one workspace.`);
            return;
          }
          const added = addBrowserAtZone(activeWorkspace.layout, focused.paneId, "right");
          if (!added) return;
          patchWorkspace(activeWorkspace.id, (ws) => ({
            ...ws,
            layout: setLeafBrowser(added.layout, added.paneId, url),
            focusedPaneId: added.paneId,
          }));
        } else if (focused) {
          patchWorkspace(activeWorkspace.id, (ws) => ({
            ...ws,
            layout: setLeafBrowser(openBrowserTab(ws.layout, focused.paneId), focused.paneId, url),
            focusedPaneId: focused.paneId,
          }));
        } else {
          window.dispatchEvent(
            new CustomEvent("voxiva-assist-open", { detail: { tab: "browser", url } }),
          );
        }
        setView("space");
        setError("");
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        setError(
          raw.includes("VS Code") || raw.includes("serve-web") || raw.includes("code")
            ? raw
            : clientError(err),
        );
      }
    },
    [activeWorkspace, patchWorkspace, t],
  );

  const toggleBrowserFocusMode = useCallback(() => {
    setBrowserFocusMode((v) => !v);
  }, []);

  const isVsCodeFocusActive = useMemo(() => {
    if (!browserFocusMode || !activeWorkspace) return false;
    const leaf = findLeaf(activeWorkspace.layout, activeWorkspace.focusedPaneId);
    if (!leaf || leaf.kind !== "browser") return false;
    const tab = activeBrowserTab(leaf);
    return isVsCodeServeWebUrl(tab?.url ?? leaf.browserUrl);
  }, [browserFocusMode, activeWorkspace]);

  const dismissSuggestedLocalUrl = useCallback(() => {
    setSuggestedLocalUrl(null);
  }, []);

  const suggestPreviewUrl = useCallback((url: string) => {
    const next = normalizeBrowserUrl(url) || url;
    if (!next) return;
    if (next === lastSuggestedUrlRef.current) return;
    lastSuggestedUrlRef.current = next;
    window.dispatchEvent(
      new CustomEvent("voxiva-assist-open", { detail: { tab: "browser", url: next } }),
    );
  }, []);

  useEffect(() => {
    const unlisten = listen<CompanionTaskEvent>("companion://task", (event) => {
      const wsId = event.payload.workspaceId || activeWorkspaceId;
      if (!wsId || !event.payload.title?.trim()) return;
      const priority = (
        ["low", "medium", "high", "critical"].includes(event.payload.priority)
          ? event.payload.priority
          : "medium"
      ) as TaskPriority;
      const tasks = loadBoard(wsId);
      saveBoard(wsId, [createTask(event.payload.title.trim(), priority), ...tasks]);
      window.dispatchEvent(
        new CustomEvent("voxiva-board-updated", { detail: { workspaceId: wsId } }),
      );
    });
    return () => {
      void unlisten.then((u) => u());
    };
  }, [activeWorkspaceId]);

  useEffect(() => {
    void companionSetWorkspace(activeWorkspaceId).catch(() => undefined);
  }, [activeWorkspaceId]);

  useEffect(() => {
    const unlisten = listen<CompanionInputEvent>("companion://input", (event) => {
      const { sessionId, text } = event.payload;
      if (!sessionId || !text) return;
      void writeTerminalSession(sessionId, text.endsWith("\r") ? text : `${text}\r`).catch(
        () => undefined,
      );
    });
    return () => {
      void unlisten.then((u) => u());
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<CompanionSpawnEvent>("companion://spawn", (event) => {
      const { workspaceId, agentId, title, command } = event.payload;
      if (!workspaceId) return;
      const ws = workspacesRef.current.find((item) => item.id === workspaceId);
      if (!ws) return;
      setActiveWorkspaceId(workspaceId);
      setView("space");
      void (async () => {
        const bot =
          agentId && agentId !== "shell" ? agentBots.find((b) => b.id === agentId) : undefined;
        const cmd = bot
          ? resolveBotCommand(bot, agentAvailability) || bot.command || command || undefined
          : command || undefined;
        const wantTitle = title || bot?.name || "Shell";

        const liveMatch = Object.values(sessionsRef.current).find((s) => {
          if (s.status !== "online") return false;
          if (!findPaneForSession(ws.layout, s.id)) return false;
          if (bot) {
            return (
              s.title === bot.name ||
              s.initialCommand === bot.command ||
              (cmd && s.initialCommand === cmd)
            );
          }
          return false;
        });
        if (liveMatch) {
          const pane = findPaneForSession(ws.layout, liveMatch.id);
          if (pane) activatePaneSession(pane, liveMatch.id);
          return;
        }

        const leaf = findLeaf(ws.layout, ws.focusedPaneId);
        const activeId = leaf?.sessionId;
        const active = activeId ? sessionsRef.current[activeId] : null;
        if (bot && cmd && active?.status === "online" && isIdleShellTitle(active.title)) {
          setSessions((current) => {
            const s = current[active.id];
            if (!s) return current;
            return {
              ...current,
              [active.id]: {
                ...s,
                title: wantTitle,
                initialCommand: cmd,
                accent: bot.accent,
              },
            };
          });
          void writeTerminalSession(active.id, `${cmd}\r`).catch(() => undefined);
          recordAgentRun({
            agentId: bot.id,
            agentName: wantTitle,
            workspaceId: ws.id,
            workspaceName: ws.name,
            cwd: ws.cwd,
            command: cmd,
            shell: bot.shell ?? null,
            accent: bot.accent,
            sessionId: active.id,
            paneId: ws.focusedPaneId,
          });
          return;
        }

        if (bot) {
          const id = await spawnInPane({
            title: wantTitle,
            command: cmd,
            paneId: ws.focusedPaneId,
            accent: bot.accent,
            mode: "tab",
          });
          if (id) {
            recordAgentRun({
              agentId: bot.id,
              agentName: wantTitle,
              workspaceId: ws.id,
              workspaceName: ws.name,
              cwd: ws.cwd,
              command: cmd,
              shell: bot.shell ?? null,
              accent: bot.accent,
              sessionId: id,
              paneId: ws.focusedPaneId,
            });
          }
          return;
        }
        await spawnInPane({
          title: wantTitle,
          command: cmd,
          paneId: ws.focusedPaneId,
          accent: "green",
          mode: "tab",
        });
      })().catch(() => undefined);
    });
    return () => {
      void unlisten.then((u) => u());
    };
  }, [activatePaneSession, agentAvailability, recordAgentRun, setView, spawnInPane]);

  useEffect(() => {
    if (!companionRunning) return;
    const push = () => {
      const sessionToWorkspace = new Map<string, string>();
      const browsers: Array<{ workspaceId: string; paneId: string; url: string; title?: string }> = [];
      for (const ws of workspaces) {
        const walk = (node: SplitNode) => {
          if (node.type === "leaf") {
            if (node.sessionId) sessionToWorkspace.set(node.sessionId, ws.id);
            for (const sid of node.sessionIds ?? []) {
              sessionToWorkspace.set(sid, ws.id);
            }
            if (leafHasBrowser(node)) {
              for (const tab of normalizeBrowserTabs(node)) {
                if (!(tab.url || "").trim()) continue;
                browsers.push({
                  workspaceId: ws.id,
                  paneId: node.paneId,
                  url: tab.url,
                  title: ws.name,
                });
              }
            }
          } else {
            walk(node.first);
            walk(node.second);
          }
        };
        walk(ws.layout);
      }
      void companionPushSnapshot({
        spaces: workspaces.map((ws) => ({
          id: ws.id,
          name: ws.name,
          cwd: ws.cwd,
          color: ws.color,
          branch: ws.branch ?? null,
        })),
        sessions: Object.values(sessions).map((session) => ({
          id: session.id,
          title: session.title,
          status: session.status,
          needsAttention: session.needsAttention,
          workspaceId: sessionToWorkspace.get(session.id) ?? null,
        })),
        boards: Object.fromEntries(
          workspaces.map((ws) => [
            ws.id,
            loadBoard(ws.id).map((task) => ({
              id: task.id,
              title: task.title,
              column: task.column,
              priority: task.priority,
              due: task.due,
              createdAt: task.createdAt,
            })),
          ]),
        ),
        history: recentHistory.slice(0, 80),
        browsers,
        agents: agentBots
          .filter((bot) => bot.id === "shell" || bot.command)
          .map((bot) => ({
            id: bot.id,
            name: bot.name,
            command: bot.command ?? null,
            ready: bot.id === "shell" || isBotReady(bot, agentAvailability, agentsScanned),
          })),
      }).catch(() => undefined);
    };
    const startId = window.setTimeout(() => push(), 1800);
    const timer = window.setInterval(push, 2500);
    return () => {
      window.clearTimeout(startId);
      window.clearInterval(timer);
    };
  }, [agentAvailability, agentsScanned, companionRunning, recentHistory, sessions, workspaces]);

  const enterSpace = useCallback(
    async (opts: EnterSpaceOptions) => {
      const cwd = opts.cwd.trim() || (await getDefaultTerminalCwd().catch(() => "."));
      const spaceName = opts.name.trim() || "My Space";

      const existing = findWorkspaceByIdentity(workspaces, spaceName, cwd);
      if (existing) {
        setActiveWorkspaceId(existing.id);
        setOnboarded(true);
        setWelcomeVisible(false);
        setView("space");
        setError("");
        pushHistory({
          workspaceId: existing.id,
          workspaceName: existing.name,
          cwd: existing.cwd,
        });
        return;
      }

      const layout = buildWelcomeLayout(opts.grid);
      queuePaneSpawns(
        pendingPaneSpawnsRef.current,
        layout,
        opts.agentIds,
        agentAvailability,
      );
      let branch: string | null = null;
      try {
        branch = await getGitBranch(cwd);
      } catch {
        branch = null;
      }
      const ws: Workspace = {
        id: uid("ws"),
        name: spaceName,
        cwd,
        branch,
        color: pickSpaceColor(workspaces, undefined),
        layout,
        focusedPaneId: firstPaneId(layout),
        pinned: false,
        shellPresets: [],
      };
      setWorkspaces((current) => (current.length === 0 ? [ws] : [...current, ws]));
      setActiveWorkspaceId(ws.id);
      setOnboarded(true);
      setWelcomeVisible(false);
      setView("space");
      setError("");
      pushHistory({
        workspaceId: ws.id,
        workspaceName: ws.name,
        cwd: ws.cwd,
      });
      void refreshAgents();
    },
    [agentAvailability, pushHistory, refreshAgents, setView, workspaces],
  );

  const launchAgent = useCallback(
    async (opts: SpawnOptions) => {
      const baseCmd = (opts.command || "").trim().split(/\s+/)[0] || "";
      const missing = Boolean(
        baseCmd && agentsScanned && agentAvailability[baseCmd] !== true,
      );
      setView("space");
      const workspace = activeWorkspace;
      if (!workspace) {
        if (missing) setError(t("agents.missingHint"));
        return null;
      }

      let paneId =
        opts.paneId && findLeaf(workspace.layout, opts.paneId)
          ? opts.paneId
          : workspace.focusedPaneId;
      if (!findLeaf(workspace.layout, paneId)) {
        paneId = firstPaneId(workspace.layout);
      }

      setError(missing ? t("agents.missingHint") : "");
      const bot =
        agentBots.find((b) => b.id === opts.agentId) ||
        agentBots.find((b) => b.name === opts.title) ||
        agentBots.find((b) => b.command === baseCmd || (b.commands ?? []).includes(baseCmd));
      const cmd = opts.command || bot?.command;

      if (!opts.forceNew) {
        const liveMatch = Object.values(sessions).find((s) => {
          if (s.status !== "online") return false;
          if (!findPaneForSession(workspace.layout, s.id)) return false;
          return (
            (bot && (s.title === bot.name || agentIdForSession(s) === bot.id)) ||
            (cmd && s.initialCommand === cmd) ||
            (baseCmd && s.initialCommand?.split(/\s+/)[0] === baseCmd) ||
            s.title === (opts.title || "")
          );
        });
        if (liveMatch) {
          const pane = findPaneForSession(workspace.layout, liveMatch.id);
          if (pane) activatePaneSession(pane, liveMatch.id);
          return liveMatch.id;
        }
      }

      const leaf = findLeaf(workspace.layout, paneId);
      const active = leaf?.sessionId ? sessions[leaf.sessionId] : null;
      if (active?.status === "online" && isIdleShellTitle(active.title) && cmd) {
        setSessions((current) => {
          const s = current[active.id];
          if (!s) return current;
          return {
            ...current,
            [active.id]: {
              ...s,
              title: opts.title || bot?.name || cmd,
              initialCommand: cmd,
              resumeCommand:
                resumeCommandFor(bot, cmd, agentAvailability) ?? s.resumeCommand,
              accent: opts.accent ?? bot?.accent ?? s.accent,
              agentId: bot?.id ?? opts.agentId ?? agentIdFromCommand(cmd) ?? s.agentId,
            },
          };
        });
        void writeTerminalSession(active.id, `${cmd}\r`).catch(() => undefined);
        recordAgentRun({
          agentId: bot?.id ?? (baseCmd || opts.command || "shell"),
          agentName: opts.title,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          cwd: workspace.cwd,
          command: bot?.command ?? (baseCmd || cmd),
          resumeCommand: resumeCommandFor(bot, cmd, agentAvailability),
          shell: opts.shell ?? null,
          accent: opts.accent ?? bot?.accent ?? "green",
          sessionId: active.id,
          paneId,
        });
        return active.id;
      }

      // Sibling tab — never wipe shells/browser already in the pane.
      const id = await spawnInPane({
        ...opts,
        title: opts.title || bot?.name || opts.command || "Agent",
        paneId,
        mode: "tab",
        agentId: bot?.id ?? opts.agentId,
      });
      if (id) {
        recordAgentRun({
          agentId: bot?.id ?? (baseCmd || opts.command || "shell"),
          agentName: opts.title,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          cwd: workspace.cwd,
          command: bot?.command ?? (baseCmd || opts.command),
          shell: opts.shell ?? null,
          accent: opts.accent ?? bot?.accent ?? "green",
          sessionId: id,
          paneId,
        });
      }
      if (!id && missing) setError(t("agents.missingHint"));
      return id;
    },
    [activatePaneSession, activeWorkspace, agentAvailability, agentsScanned, recordAgentRun, sessions, spawnInPane, t],
  );

  const resumeAgentRun = useCallback(
    async (run: AgentRun, opts?: { paneId?: string; forceNew?: boolean }) => {
      let ws = workspacesRef.current.find((w) => w.id === run.workspaceId);
      if (!ws && run.vaultId) {
        const norm = run.cwd.replace(/\\/g, "/").toLowerCase();
        ws =
          workspacesRef.current.find(
            (w) => w.cwd.replace(/\\/g, "/").toLowerCase() === norm,
          ) ??
          workspacesRef.current.find((w) => w.id === activeWorkspaceIdRef.current) ??
          workspacesRef.current[0];
      }
      if (!ws) {
        setError(t("recentAgents.gone"));
        return;
      }
      setActiveWorkspaceId(ws.id);
      setView("space");
      setError("");
      pushHistory({ workspaceId: ws.id, workspaceName: ws.name, cwd: ws.cwd });

      const liveSessions = sessionsRef.current;

      if (!opts?.forceNew && run.sessionId && run.paneId) {
        const session = liveSessions[run.sessionId];
        const leaf = findLeaf(ws.layout, run.paneId);
        const tabs = leaf ? leafTabIds(leaf) : [];
        if (session?.status === "online" && tabs.includes(run.sessionId)) {
          // Focus existing only when staying on that pane — never steal it for another drop target.
          if (!opts?.paneId || opts.paneId === run.paneId) {
            activatePaneSession(run.paneId, run.sessionId);
            touchAgentRun(run.id, { at: Date.now() });
            return;
          }
        }
      }

      const bot = agentBots.find((b) => b.id === run.agentId);
      const command =
        run.resumeCommand?.trim() ||
        resumeCommandFor(bot, run.command, agentAvailability);
      if (!command) {
        setError(t("agents.missingHint"));
        return;
      }

      const paneId =
        opts?.paneId && findLeaf(workspacesRef.current.find((w) => w.id === ws.id)?.layout ?? ws.layout, opts.paneId)
          ? opts.paneId
          : run.paneId && findLeaf(workspacesRef.current.find((w) => w.id === ws.id)?.layout ?? ws.layout, run.paneId)
            ? run.paneId
            : (workspacesRef.current.find((w) => w.id === ws.id) ?? ws).focusedPaneId;

      // Block empty-pane auto-Shell until we finish writing/spawning the resume CLI.
      holdEmptyPaneSpawn(paneId);
      try {
        // Let an in-flight empty Shell land so we can reuse it instead of racing replace.
        if (!opts?.forceNew) {
          await yieldToUi(80);
        }

        const liveWs = workspacesRef.current.find((w) => w.id === ws.id) ?? ws;
        const sessionsNow = sessionsRef.current;
        const leaf = findLeaf(liveWs.layout, paneId);
        const tabIds = leaf ? leafTabIds(leaf) : [];
        const activeId =
          leaf?.sessionId && tabIds.includes(leaf.sessionId) ? leaf.sessionId : (tabIds[0] ?? null);
        const active = activeId ? sessionsNow[activeId] : null;
        const tabTitle = bot?.name || run.agentName || command;

        // Reuse a lone idle Shell only — never kill/replace other tabs or agents.
        if (
          !opts?.forceNew &&
          tabIds.length <= 1 &&
          active?.status === "online" &&
          isIdleShellTitle(active.title)
        ) {
          setSessions((current) => {
            const s = current[active.id];
            if (!s) return current;
            return {
              ...current,
              [active.id]: {
                ...s,
                title: tabTitle,
                initialCommand: command,
                accent: run.accent ?? bot?.accent ?? s.accent,
                agentId: run.agentId ?? bot?.id ?? s.agentId,
              },
            };
          });
          activatePaneSession(paneId, active.id);
          window.setTimeout(() => {
            void writeTerminalSession(active.id, `${command}\r`).catch(() => undefined);
          }, 450);
          touchAgentRun(run.id, { sessionId: active.id, paneId, at: Date.now() });
          return;
        }

        // Always add a tab — keep every existing session/browser/media in the pane.
        const id = await spawnInPane({
          title: tabTitle,
          command,
          shell: run.shell ?? (preferredShell.trim() || null),
          accent: run.accent ?? bot?.accent,
          paneId,
          mode: "tab",
          workspaceId: ws.id,
          agentId: run.agentId ?? bot?.id,
        });
        if (id) {
          activatePaneSession(paneId, id);
          touchAgentRun(run.id, { sessionId: id, paneId, at: Date.now() });
        } else {
          setError(t("agents.missingHint"));
        }
      } finally {
        releaseEmptyPaneSpawn(paneId);
      }
    },
    [
      pushHistory,
      setView,
      agentAvailability,
      preferredShell,
      activatePaneSession,
      spawnInPane,
      touchAgentRun,
      holdEmptyPaneSpawn,
      releaseEmptyPaneSpawn,
      t,
    ],
  );

  const resumeAgentRunAtDrop = useCallback(
    async (run: AgentRun, anchorPaneId: string, zone: DropZone) => {
      let ws = workspacesRef.current.find((w) => w.id === run.workspaceId);
      if (!ws && run.vaultId) {
        const norm = run.cwd.replace(/\\/g, "/").toLowerCase();
        ws =
          workspacesRef.current.find(
            (w) => w.cwd.replace(/\\/g, "/").toLowerCase() === norm,
          ) ??
          workspacesRef.current.find((w) => w.id === activeWorkspaceIdRef.current) ??
          workspacesRef.current[0];
      }
      if (!ws) {
        setError(t("recentAgents.gone"));
        return;
      }
      const sameWorkspace = ws.id === activeWorkspaceIdRef.current;

      // History drop never steals/moves a live tab — always open another resume
      // beside (edge) or as a new tab (empty center). Keep originals intact.

      let targetPaneId = anchorPaneId;
      if (sameWorkspace && findLeaf(ws.layout, anchorPaneId) && zone !== "center") {
        if (countLeaves(ws.layout) >= MAX_PANES) {
          setError(`You can open up to ${MAX_PANES} panes in one workspace.`);
          return;
        }
        const added = addShellAtZone(ws.layout, anchorPaneId, zone);
        if (!added) return;
        // Hold before layout commit so the new empty leaf never auto-spawns Shell.
        holdEmptyPaneSpawn(added.paneId);
        patchWorkspace(ws.id, (w) => ({
          ...w,
          layout: added.layout,
          focusedPaneId: added.paneId,
        }));
        targetPaneId = added.paneId;
        setView("space");
        await yieldToUi(40);
        try {
          await resumeAgentRun(run, { paneId: targetPaneId, forceNew: true });
        } finally {
          releaseEmptyPaneSpawn(added.paneId);
        }
        return;
      }

      if (!sameWorkspace) {
        targetPaneId =
          run.paneId && findLeaf(ws.layout, run.paneId) ? run.paneId : ws.focusedPaneId;
      } else {
        // Center drop — hold so in-flight empty Shell cannot replace the resume.
        holdEmptyPaneSpawn(targetPaneId);
      }

      try {
        // forceNew: keep every existing tab; open resume as an extra tab (or new edge pane).
        await resumeAgentRun(run, {
          paneId: targetPaneId,
          forceNew: true,
        });
      } finally {
        if (sameWorkspace) {
          releaseEmptyPaneSpawn(targetPaneId);
        }
      }
    },
    [
      setView,
      patchWorkspace,
      resumeAgentRun,
      holdEmptyPaneSpawn,
      releaseEmptyPaneSpawn,
      t,
    ],
  );

  const removeAgentRun = useCallback((id: string) => {
    setAgentRuns((current) => current.filter((run) => run.id !== id));
  }, []);

  const clearAgentRuns = useCallback(() => {
    setAgentRuns([]);
  }, []);

  const resetOnboarding = showWelcomeScreen;

  const updateWorkspace = useCallback(
    async (
      id: string,
      patch: Partial<Pick<Workspace, "name" | "cwd" | "color" | "shellPresets" | "pinned">>,
    ) => {
      let branch: string | null | undefined;
      if (patch.cwd !== undefined) {
        const nextCwd = patch.cwd.trim();
        if (nextCwd) {
          try {
            branch = await getGitBranch(nextCwd);
          } catch {
            branch = null;
          }
        } else {
          branch = null;
        }
        patch = { ...patch, cwd: nextCwd };
      }
      patchWorkspace(id, (ws) => ({
        ...ws,
        ...patch,
        ...(branch !== undefined ? { branch } : {}),
      }));
    },
    [patchWorkspace],
  );

  const toggleWorkspacePinned = useCallback(
    (id: string) => {
      patchWorkspace(id, (ws) => ({ ...ws, pinned: !ws.pinned }));
    },
    [patchWorkspace],
  );

  const removeWorkspace = useCallback(
    async (id: string) => {
      const target = workspaces.find((w) => w.id === id);
      if (!target) return;
      rememberClosed({
        kind: "workspace",
        name: target.name,
        cwd: target.cwd,
        color: target.color,
        pinned: target.pinned,
      });
      const ids = collectSessionIds(target.layout);
      for (const sessionId of ids) {
        try {
          await killTerminalSession(sessionId);
        } catch {
          // already dead
        }
      }
      setSessions((current) => {
        const next = { ...current };
        for (const sessionId of ids) delete next[sessionId];
        return next;
      });
      setWorkspaces((current) => {
        const next = current.filter((w) => w.id !== id);
        setActiveWorkspaceId((active) => {
          if (active !== id) return active;
          return next[0]?.id ?? null;
        });
        return next;
      });
    },
    [rememberClosed, workspaces],
  );

  const refreshBranch = useCallback(
    async (id: string) => {
      const ws = workspaces.find((item) => item.id === id);
      if (!ws) return;
      try {
        const branch = await getGitBranch(ws.cwd);
        patchWorkspace(id, (item) => ({ ...item, branch }));
      } catch {
        patchWorkspace(id, (item) => ({ ...item, branch: null }));
      }
    },
    [patchWorkspace, workspaces],
  );

  const focusPane = useCallback(
    (paneId: string) => {
      if (!activeWorkspace) return;
      const leaf = findLeaf(activeWorkspace.layout, paneId);
      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        focusedPaneId: paneId,
      }));
      rememberFocusPoint({ workspaceId: activeWorkspace.id, paneId });
      const ids = leaf ? leafTabIds(leaf) : [];
      if (!ids.length) return;
      setSessions((current) => {
        let changed = false;
        const next = { ...current };
        for (const id of ids) {
          const session = next[id];
          if (!session?.needsAttention) continue;
          next[id] = { ...session, needsAttention: false };
          changed = true;
        }
        return changed ? next : current;
      });
    },
    [activeWorkspace, patchWorkspace, rememberFocusPoint],
  );

  const swapPanes = useCallback(
    (fromPaneId: string, toPaneId: string) => {
      dockPane(fromPaneId, toPaneId, "center");
    },
    [dockPane],
  );

  const applySnapLayout = useCallback(
    async (id: SnapLayoutId, primaryPaneId?: string) => {
      if (!activeWorkspace) return;
      const layout = arrangeSnapLayout(activeWorkspace.layout, id, primaryPaneId);
      const focused =
        (primaryPaneId && findLeaf(layout, primaryPaneId)?.paneId) || firstPaneId(layout);
      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        layout,
        focusedPaneId: focused,
      }));
    },
    [activeWorkspace, patchWorkspace],
  );

  const snapDragToLayout = useCallback(
    (id: SnapLayoutId, fromPaneId: string, tabId?: string) => {
      if (!activeWorkspace) return;
      patchWorkspace(activeWorkspace.id, (ws) => {
        let layout = ws.layout;
        let primary = fromPaneId;
        if (tabId) {
          const leaf = findLeaf(layout, fromPaneId);
          if (leaf && leafSurfaceCount(leaf) >= 2) {
            const docked = dockTab(layout, fromPaneId, fromPaneId, tabId, "right");
            layout = docked.layout;
            primary = docked.focusPaneId;
          }
        }
        layout = arrangeSnapLayout(layout, id, primary);
        return {
          ...ws,
          layout,
          focusedPaneId: findLeaf(layout, primary)?.paneId ?? firstPaneId(layout),
        };
      });
      setView("space");
    },
    [activeWorkspace, patchWorkspace],
  );

  const splitFocused = useCallback(
    async (direction: SplitDirection, targetPaneId?: string) => {
      if (!activeWorkspace) return null;
      if (countLeaves(activeWorkspace.layout) >= MAX_PANES) {
        setError(`You can open up to ${MAX_PANES} panes in one workspace.`);
        return null;
      }
      const paneId = targetPaneId ?? activeWorkspace.focusedPaneId;
      if (!findLeaf(activeWorkspace.layout, paneId)) return null;

      const added = addShellBeside(activeWorkspace.layout, paneId, direction);
      if (!added) return null;
      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        layout: added.layout,
        focusedPaneId: added.paneId,
      }));
      return added.paneId;
    },
    [activeWorkspace, patchWorkspace],
  );

  const splitShellAt = useCallback(
    async (targetPaneId: string, zone: Exclude<DropZone, "center">) => {
      if (!activeWorkspace) return;
      if (countLeaves(activeWorkspace.layout) >= MAX_PANES) {
        setError(`You can open up to ${MAX_PANES} panes in one workspace.`);
        return;
      }
      if (!findLeaf(activeWorkspace.layout, targetPaneId)) return;
      const added = addShellAtZone(activeWorkspace.layout, targetPaneId, zone);
      if (!added) return;
      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        layout: added.layout,
        focusedPaneId: added.paneId,
      }));
      setView("space");
    },
    [activeWorkspace, patchWorkspace, setView],
  );

  const openMediaPreviewAt = useCallback(
    (paneId: string, zone: DropZone, absPath: string) => {
      if (!activeWorkspace) return;
      const trimmed = absPath.trim();
      if (!trimmed) return;
      focusPane(paneId);
      setView("space");

      if (zone !== "center") {
        if (countLeaves(activeWorkspace.layout) >= MAX_PANES) {
          setError(`You can open up to ${MAX_PANES} panes in one workspace.`);
          return;
        }
        const added = addMediaAtZone(activeWorkspace.layout, paneId, zone, trimmed);
        if (!added) return;
        patchWorkspace(activeWorkspace.id, (ws) => ({
          ...ws,
          layout: added.layout,
          focusedPaneId: added.paneId,
        }));
        return;
      }

      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        layout: setLeafMedia(ws.layout, paneId, trimmed),
        focusedPaneId: paneId,
      }));
    },
    [activeWorkspace, focusPane, patchWorkspace, setView],
  );

  const clearPaneMedia = useCallback(
    (paneId: string) => {
      if (!activeWorkspace) return;
      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        layout: setLeafMedia(ws.layout, paneId, null),
      }));
    },
    [activeWorkspace, patchWorkspace],
  );

  const handleFileDropAt = useCallback(
    async (
      paneId: string,
      zone: DropZone | "chat",
      pastePayload: string,
      opts?: { shiftKey?: boolean; rawPaths?: string[] },
    ) => {
      if (!activeWorkspace) return;
      const previewPath = opts?.rawPaths?.find(
        (p) =>
          p &&
          isPreviewDropPath(p) &&
          (/[\\/]/.test(p) || /^[a-zA-Z]:/.test(p) || p.startsWith("/")),
      );
      // Shift or explicit preview path — open media; otherwise agent chat attaches @path.
      if (previewPath && (opts?.shiftKey || zone !== "chat")) {
        focusPane(paneId);
        setView("space");
        openMediaPreviewAt(paneId, zone === "chat" ? "center" : zone, previewPath);
        return;
      }

      const leaf = findLeaf(activeWorkspace.layout, paneId);
      if (!leaf) return;
      focusPane(paneId);
      setView("space");

      const tabs = leafTabIds(leaf);
      const sessionId =
        leaf.sessionId && tabs.includes(leaf.sessionId) ? leaf.sessionId : (tabs[0] ?? null);
      const session = sessionId ? sessions[sessionId] : null;

      // cmux: drop onto agent pane → @path into the prompt (whole pane).
      if (zone === "chat" && sessionId && session) {
        const agentId = agentIdForSession(session, agentRuns);
        const paths = (opts?.rawPaths ?? []).map((p) => p.trim()).filter(Boolean);
        let payload = pastePayload;
        if (paths.length && agentId !== "shell") {
          payload = formatAgentAttachment(agentId, paths, pastePayload) ?? pastePayload;
        }
        if (!payload.trim()) return;
        const toWrite =
          agentId !== "shell" ? wrapAgentPaste(agentId, payload) : payload;
        activatePaneSession(paneId, sessionId);
        if (session.status === "online") {
          void writeTerminalSession(sessionId, toWrite).catch(() => undefined);
        } else {
          pendingSessionPasteRef.current.set(sessionId, toWrite);
        }
        return;
      }

      if (!pastePayload.trim()) return;

      if (zone !== "center" && zone !== "chat") {
        if (countLeaves(activeWorkspace.layout) >= MAX_PANES) {
          setError(`You can open up to ${MAX_PANES} panes in one workspace.`);
          return;
        }
        const added = addShellAtZone(activeWorkspace.layout, paneId, zone);
        if (!added) return;
        pendingPaneSpawnsRef.current.set(added.paneId, {
          title: "Shell",
          accent: "green",
          paneId: added.paneId,
          paste: pastePayload,
        });
        patchWorkspace(activeWorkspace.id, (ws) => ({
          ...ws,
          layout: added.layout,
          focusedPaneId: added.paneId,
        }));
        return;
      }

      if (session?.status === "online" && sessionId) {
        const agentId = agentIdForSession(session, agentRuns);
        const toWrite =
          agentId !== "shell" ? wrapAgentPaste(agentId, pastePayload) : pastePayload;
        activatePaneSession(paneId, sessionId);
        void writeTerminalSession(sessionId, toWrite).catch(() => undefined);
        return;
      }

      if (sessionId && session) {
        const agentId = agentIdForSession(session, agentRuns);
        const toWrite =
          agentId !== "shell" ? wrapAgentPaste(agentId, pastePayload) : pastePayload;
        pendingSessionPasteRef.current.set(sessionId, toWrite);
        activatePaneSession(paneId, sessionId);
        return;
      }

      pendingPaneSpawnsRef.current.set(paneId, {
        title: "Shell",
        accent: "green",
        paneId,
        paste: pastePayload,
      });
    },
    [
      activeWorkspace,
      activatePaneSession,
      agentRuns,
      focusPane,
      openMediaPreviewAt,
      patchWorkspace,
      sessions,
      setView,
    ],
  );

  const queueSavedSpawns = useCallback((spawnQueues: Map<string, SavedShellSpec[]>) => {
    pendingPaneSpawnQueuesRef.current.clear();
    pendingPaneSpawnsRef.current.clear();
    for (const [paneId, specs] of spawnQueues) {
      pendingPaneSpawnQueuesRef.current.set(
        paneId,
        specs.map((spec) => ({
          title: spec.title,
          command: spec.command,
          accent: spec.accent ?? "green",
          paneId,
        })),
      );
    }
  }, []);

  const clearWorkspaceSessions = useCallback(async (workspace: Workspace) => {
    const ids = collectLeaves(workspace.layout).flatMap((leaf) => leafTabIds(leaf));
    for (const sessionId of ids) {
      try {
        await killTerminalSession(sessionId);
      } catch {
        // ignore
      }
    }
    setSessions((current) => {
      const next = { ...current };
      for (const sessionId of ids) delete next[sessionId];
      return next;
    });
  }, []);

  const saveCurrentLayoutAs = useCallback(
    (name: string) => {
      if (!activeWorkspace) return;
      const captured = captureWorkspaceLayout(activeWorkspace, sessions, name);
      setSavedLayouts((current) => [captured, ...current.filter((item) => item.name !== captured.name)]);
    },
    [activeWorkspace, sessions],
  );

  const removeSavedLayout = useCallback((id: string) => {
    setSavedLayouts((current) => current.filter((item) => item.id !== id));
  }, []);

  const applySavedLayout = useCallback(
    async (id: string) => {
      if (!activeWorkspace) return;
      const saved = savedLayouts.find((item) => item.id === id);
      if (!saved) return;
      if (savedLayoutPaneCount(saved) > MAX_PANES) {
        setError(`Layout has more than ${MAX_PANES} panes.`);
        return;
      }
      const built = buildLayoutFromSaved(saved);
      await clearWorkspaceSessions(activeWorkspace);
      queueSavedSpawns(built.spawnQueues);
      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        layout: built.layout,
        focusedPaneId: firstPaneId(built.layout),
      }));
      setView("space");
    },
    [activeWorkspace, clearWorkspaceSessions, patchWorkspace, queueSavedSpawns, savedLayouts, setError, setView],
  );

  const openNewSpaceFromLayout = useCallback(
    async (id: string) => {
      const saved = savedLayouts.find((item) => item.id === id);
      if (!saved) return;
      if (savedLayoutPaneCount(saved) > MAX_PANES) {
        setError(`Layout has more than ${MAX_PANES} panes.`);
        return;
      }
      const cwd = activeWorkspace?.cwd?.trim() || ".";
      const built = buildLayoutFromSaved(saved);
      queueSavedSpawns(built.spawnQueues);
      let branch: string | null = null;
      try {
        branch = await getGitBranch(cwd);
      } catch {
        branch = null;
      }
      const ws: Workspace = {
        id: uid("ws"),
        name: saved.name,
        cwd,
        branch,
        color: pickSpaceColor(workspaces),
        layout: built.layout,
        focusedPaneId: firstPaneId(built.layout),
        pinned: false,
        shellPresets: [],
      };
      setWorkspaces((current) => [...current, ws]);
      setActiveWorkspaceId(ws.id);
      setOnboarded(true);
      setView("space");
      pushHistory({
        workspaceId: ws.id,
        workspaceName: ws.name,
        cwd: ws.cwd,
      });
    },
    [activeWorkspace?.cwd, pushHistory, queueSavedSpawns, savedLayouts, setView, workspaces],
  );

  const closeSession = useCallback(
    async (sessionId: string) => {
      const session = sessionsRef.current[sessionId];
      const wsId =
        workspacesRef.current.find((w) => findPaneForSession(w.layout, sessionId))?.id ??
        activeWorkspaceIdRef.current;
      if (session && wsId) {
        rememberClosed({
          kind: "terminal",
          workspaceId: wsId,
          title: session.title,
          cwd: session.cwd,
          shell: session.shell,
          agentId: session.agentId,
          command: session.resumeCommand || session.initialCommand,
        });
      }
      try {
        await killTerminalSession(sessionId);
      } catch {
        // ignore
      }
      setSessions((current) => {
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
      setWorkspaces((current) =>
        current.map((ws) => {
          const paneId = findPaneForSession(ws.layout, sessionId);
          if (!paneId) return ws;
          return { ...ws, layout: removeLeafSession(ws.layout, paneId, sessionId) };
        }),
      );
    },
    [rememberClosed],
  );

  const renameSession = useCallback((sessionId: string, title: string) => {
    const next = title.trim() || "Shell";
    setSessions((current) => {
      const session = current[sessionId];
      if (!session || session.title === next) return current;
      return { ...current, [sessionId]: { ...session, title: next } };
    });
    setAgentRuns((current) => {
      let changed = false;
      const mapped = current.map((run) => {
        if (run.sessionId !== sessionId) return run;
        if (run.agentName === next) return run;
        changed = true;
        return { ...run, agentName: next, at: Date.now() };
      });
      return changed ? mapped : current;
    });
  }, []);

  useEffect(() => {
    const unlisten = listen<CompanionRenameEvent>("companion://rename", (event) => {
      const { sessionId, title } = event.payload;
      if (!sessionId) return;
      renameSession(sessionId, title || "Shell");
    });
    return () => {
      void unlisten.then((u) => u());
    };
  }, [renameSession]);

  const closePane = useCallback(
    async (paneId: string) => {
      if (!activeWorkspace) return;
      const leaf = findLeaf(activeWorkspace.layout, paneId);
      if (leaf) {
        for (const tab of normalizeBrowserTabs(leaf)) {
          if (tab.url.trim()) {
            rememberClosed({
              kind: "browser",
              workspaceId: activeWorkspace.id,
              url: tab.url,
            });
          }
        }
        for (const id of leafTabIds(leaf)) {
          const session = sessionsRef.current[id];
          if (!session) continue;
          rememberClosed({
            kind: "terminal",
            workspaceId: activeWorkspace.id,
            title: session.title,
            cwd: session.cwd,
            shell: session.shell,
            agentId: session.agentId,
            command: session.resumeCommand || session.initialCommand,
          });
        }
      }
      if (leaf && leafHasBrowser(leaf)) {
        for (const tab of normalizeBrowserTabs(leaf)) {
          await browserClose(`browser-${paneId}-${tab.id}`).catch(() => undefined);
        }
        await browserClose(`browser-${paneId}`).catch(() => undefined);
      }
      const tabIds = leaf ? leafTabIds(leaf) : [];
      for (const id of tabIds) {
        try {
          await killTerminalSession(id);
        } catch {
          // ignore
        }
      }
      if (tabIds.length) {
        setSessions((current) => {
          const next = { ...current };
          for (const id of tabIds) delete next[id];
          return next;
        });
      }
      const next = removePane(activeWorkspace.layout, paneId);
      if (!next) {
        const fresh = createLeaf(null);
        patchWorkspace(activeWorkspace.id, (ws) => ({
          ...ws,
          layout: fresh,
          focusedPaneId: fresh.paneId,
        }));
        return;
      }
      const balanced = equalizeLayout(next);
      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        layout: balanced,
        focusedPaneId: firstPaneId(balanced),
      }));
    },
    [activeWorkspace, patchWorkspace, rememberClosed],
  );

  const closeFocusedPane = useCallback(async () => {
    if (!activeWorkspace) return;
    await closePane(activeWorkspace.focusedPaneId);
  }, [activeWorkspace, closePane]);

  const closePaneSurface = useCallback(
    async (paneId: string, tabId: string) => {
      if (!activeWorkspace) return;
      const leaf = findLeaf(activeWorkspace.layout, paneId);
      if (!leaf) return;
      if (leafSurfaceCount(leaf) <= 1) {
        await closePane(paneId);
        return;
      }
      if (isBrowserTabKey(tabId) || tabId === BROWSER_TAB) {
        closeBrowserTabInPane(paneId, tabId);
        return;
      }
      if (tabId === MEDIA_TAB) {
        clearPaneMedia(paneId);
        return;
      }
      await closeSession(tabId);
    },
    [activeWorkspace, clearPaneMedia, closePane, closeBrowserTabInPane, closeSession],
  );

  const reopenClosed = useCallback(async () => {
    const { next, item } = popClosed(closedStackRef.current);
    if (!item) return false;
    closedStackRef.current = next;
    syncNavFlags();
    setView("space");
    if (item.kind === "workspace") {
      await createWorkspace({
        name: item.name,
        cwd: item.cwd,
        color: isSpaceColor(item.color) ? item.color : undefined,
      });
      return true;
    }
    if (item.kind === "browser") {
      const ws = workspacesRef.current.find((w) => w.id === item.workspaceId);
      if (ws && activeWorkspaceIdRef.current !== ws.id) {
        selectWorkspace(ws.id);
        await yieldToUi(30);
      }
      await openBrowserWithUrl(item.url);
      return true;
    }
    // terminal / agent
    const ws = workspacesRef.current.find((w) => w.id === item.workspaceId);
    if (ws && activeWorkspaceIdRef.current !== ws.id) {
      selectWorkspace(ws.id);
      await yieldToUi(30);
    }
    await spawnInFocused({
      title: item.title,
      shell: item.shell,
      command: item.command,
      agentId: item.agentId,
      accent: item.agentId ? "violet" : "green",
      mode: "tab",
      forceNew: true,
      workspaceId: item.workspaceId,
    });
    return true;
  }, [createWorkspace, openBrowserWithUrl, selectWorkspace, setView, spawnInFocused, syncNavFlags]);

  const applyFocusPoint = useCallback(
    (point: FocusPoint) => {
      suppressFocusNavRef.current = true;
      try {
        const ws = workspacesRef.current.find((w) => w.id === point.workspaceId);
        if (!ws) return false;
        if (activeWorkspaceIdRef.current !== ws.id) {
          setActiveWorkspaceId(ws.id);
          setViewState("space");
        } else {
          setView("space");
        }
        if (point.paneId && findLeaf(ws.layout, point.paneId)) {
          patchWorkspace(ws.id, (w) => ({ ...w, focusedPaneId: point.paneId! }));
        }
        return true;
      } finally {
        queueMicrotask(() => {
          suppressFocusNavRef.current = false;
        });
      }
    },
    [patchWorkspace, setView],
  );

  const goFocusBack = useCallback(() => {
    const step = focusBack(focusTrailRef.current, focusIndexRef.current);
    if (!step) return false;
    focusIndexRef.current = step.index;
    syncNavFlags();
    return applyFocusPoint(step.point);
  }, [applyFocusPoint, syncNavFlags]);

  const goFocusForward = useCallback(() => {
    const step = focusForward(focusTrailRef.current, focusIndexRef.current);
    if (!step) return false;
    focusIndexRef.current = step.index;
    syncNavFlags();
    return applyFocusPoint(step.point);
  }, [applyFocusPoint, syncNavFlags]);

  const restartSession = useCallback(
    async (sessionId: string) => {
      const session = sessions[sessionId];
      if (!session || !activeWorkspace) return;
      const paneId = findPaneForSession(activeWorkspace.layout, sessionId);
      try {
        await killTerminalSession(sessionId);
      } catch {
        // ignore
      }
      setSessions((current) => {
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
      if (paneId) {
        // Remove the old PTY id first; the replacement receives a new backend id.
        patchWorkspace(activeWorkspace.id, (ws) => ({
          ...ws,
          layout: removeLeafSession(ws.layout, paneId, sessionId),
        }));
        const command = autoResumeAgents
          ? resolveRestoreCommand(session, agentAvailability)
          : undefined;
        await spawnInPane({
          paneId,
          title: session.title,
          shell: session.shell || preferredShell.trim() || null,
          accent: session.accent,
          command,
          agentId: session.agentId,
          mode: "tab",
        });
      }
    },
    [
      activeWorkspace,
      agentAvailability,
      autoResumeAgents,
      patchWorkspace,
      preferredShell,
      sessions,
      spawnInPane,
    ],
  );

  const restoreSession = useCallback(
    async (sessionId: string) => {
      const session = sessionsRef.current[sessionId];
      if (!session || !activeWorkspace) return;
      const paneId = findPaneForSession(activeWorkspace.layout, sessionId);
      if (!paneId) return;

      setSessions((current) => ({
        ...current,
        [sessionId]: { ...session, status: "starting" },
      }));

      try {
        await killTerminalSession(sessionId);
      } catch {
        // ignore — stale id after last run
      }

      try {
        const command = autoResumeAgents
          ? resolveRestoreCommand(session, agentAvailability)
          : undefined;
        const created = await enqueueTerminalSpawn(() =>
          createTerminalSession({
            cwd: session.cwd || activeWorkspace.cwd || null,
            shell: session.shell || preferredShell.trim() || null,
            title: session.title,
            cols: PTY_COLS,
            rows: PTY_ROWS,
            initialCommand: command?.trim() || null,
          }),
        );
        const nextSession: TerminalSession = {
          id: created.id,
          title: created.title,
          cwd: created.cwd || session.cwd,
          shell: created.shell,
          status: "online",
          accent: session.accent,
          needsAttention: false,
          initialCommand: session.initialCommand,
          resumeCommand: session.resumeCommand || command,
          agentId: session.agentId,
        };
        setSessions((current) => {
          const next = { ...current };
          delete next[sessionId];
          next[created.id] = nextSession;
          return next;
        });
        patchWorkspace(activeWorkspace.id, (ws) => ({
          ...ws,
          layout: replaceLeafSessionId(ws.layout, paneId, sessionId, created.id),
        }));
        // Refresh vault-backed session id in the background (does not block reopen).
        if (autoResumeAgents && session.agentId && session.agentId !== "shell") {
          const attachId = created.id;
          const attachAgent = session.agentId;
          const attachCwd = nextSession.cwd;
          window.setTimeout(() => {
            void lookupVaultResumeCommand(attachAgent, attachCwd).then((vaultResume) => {
              if (!vaultResume) return;
              setSessions((current) => {
                const live = current[attachId];
                if (!live) return current;
                return { ...current, [attachId]: { ...live, resumeCommand: vaultResume } };
              });
            });
          }, 2500);
        }
      } catch (err) {
        setSessions((current) => ({
          ...current,
          [sessionId]: { ...session, status: "error" },
        }));
        setError(clientError(err));
      }
    },
    [
      activeWorkspace,
      agentAvailability,
      autoResumeAgents,
      patchWorkspace,
      preferredShell,
      setError,
    ],
  );

  useEffect(() => {
    if (welcomeVisible || !activeWorkspace) return;
    const pending = collectSessionIds(activeWorkspace.layout).filter((id) =>
      restorePendingIdsRef.current.delete(id),
    );
    if (!pending.length) return;

    const focusedLeaf = findLeaf(activeWorkspace.layout, activeWorkspace.focusedPaneId);
    const focusedId = focusedLeaf?.sessionId;
    const ordered = [
      ...(focusedId && pending.includes(focusedId) ? [focusedId] : []),
      ...pending.filter((id) => id !== focusedId),
    ];

    for (const id of ordered) {
      void restoreSession(id);
    }
  }, [activeWorkspace, restoreSession, welcomeVisible]);

  const clearAttention = useCallback((sessionId: string) => {
    clearAttentionNotifyState(sessionId);
    setSessions((current) => {
      const session = current[sessionId];
      if (!session) return current;
      return { ...current, [sessionId]: { ...session, needsAttention: false } };
    });
  }, []);

  const focusAttention = useCallback(
    (target: { workspaceId: string; paneId: string; sessionId: string }) => {
      const session = sessions[target.sessionId];
      if (!session) return false;
      setView("space");
      if (target.workspaceId !== activeWorkspace?.id) {
        setActiveWorkspaceId(target.workspaceId);
      }
      patchWorkspace(target.workspaceId, (ws) => ({
        ...ws,
        layout: activateLeafSession(ws.layout, target.paneId, target.sessionId),
        focusedPaneId: target.paneId,
      }));
      setMaximizedPaneId(target.paneId);
      clearAttentionNotifyState(target.sessionId);
      setSessions((current) => {
        const row = current[target.sessionId];
        if (!row?.needsAttention) return current;
        return { ...current, [target.sessionId]: { ...row, needsAttention: false } };
      });
      window.clearTimeout(flashTimerRef.current);
      setFlashPaneId(target.paneId);
      flashTimerRef.current = window.setTimeout(() => setFlashPaneId(null), 900);
      void Promise.resolve()
        .then(() => getCurrentWindow().setFocus())
        .catch(() => undefined);
      return true;
    },
    [activeWorkspace, patchWorkspace, sessions, setView],
  );

  const listAttention = useCallback(() => {
    const items: Array<{
      workspaceId: string;
      workspaceName: string;
      paneId: string;
      sessionId: string;
      title: string;
      reason: string;
      at: number;
    }> = [];
    for (const ws of workspaces) {
      for (const leaf of collectLeaves(ws.layout)) {
        for (const sessionId of leafTabIds(leaf)) {
          const session = sessions[sessionId];
          if (!session?.needsAttention) continue;
          items.push({
            workspaceId: ws.id,
            workspaceName: ws.name,
            paneId: leaf.paneId,
            sessionId,
            title: session.title || "Shell",
            reason: attentionReason(sessionId),
            at: attentionStamp(sessionId),
          });
        }
      }
    }
    items.sort((a, b) => b.at - a.at || a.sessionId.localeCompare(b.sessionId));
    return items;
  }, [sessions, workspaces]);

  const clearAllAttention = useCallback(() => {
    const ids: string[] = [];
    for (const ws of workspaces) {
      for (const id of collectSessionIds(ws.layout)) {
        if (sessions[id]?.needsAttention) ids.push(id);
      }
    }
    if (!ids.length) return;
    for (const id of ids) clearAttentionNotifyState(id);
    setSessions((current) => {
      let next = current;
      for (const id of ids) {
        const row = next[id];
        if (!row?.needsAttention) continue;
        if (next === current) next = { ...current };
        next[id] = { ...row, needsAttention: false };
      }
      return next;
    });
  }, [sessions, workspaces]);

  const focusNextAttention = useCallback(() => {
    const items = listAttention();
    if (!items.length) return false;
    const next = items[0]!;
    return focusAttention({
      workspaceId: next.workspaceId,
      paneId: next.paneId,
      sessionId: next.sessionId,
    });
  }, [focusAttention, listAttention]);

  const equalizeSplits = useCallback(() => {
    if (!activeWorkspace) return;
    patchWorkspace(activeWorkspace.id, (ws) => ({
      ...ws,
      layout: equalizeLayout(ws.layout),
    }));
  }, [activeWorkspace, patchWorkspace]);

  const toggleMaximizeFocusedPane = useCallback(() => {
    if (!activeWorkspace) return;
    const paneId = activeWorkspace.focusedPaneId;
    setMaximizedPaneId((cur) => (cur === paneId ? null : paneId));
  }, [activeWorkspace]);

  const moveWorkspaceToTop = useCallback((id: string) => {
    setWorkspaces((current) => {
      const target = current.find((w) => w.id === id);
      if (!target) return current;
      const rest = current.filter((w) => w.id !== id);
      return [{ ...target, pinned: true }, ...rest];
    });
  }, []);

  const closeFocusedTab = useCallback(async () => {
    if (!activeWorkspace) return;
    const leaf = findLeaf(activeWorkspace.layout, activeWorkspace.focusedPaneId);
    if (!leaf) return;
    let tabId: string | null = null;
    if (leaf.kind === "media" && leaf.mediaPath) tabId = MEDIA_TAB;
    else if (leaf.kind === "browser" && leafHasBrowser(leaf)) {
      const tab = activeBrowserTab(leaf);
      tabId = tab ? makeBrowserTabKey(tab.id) : BROWSER_TAB;
    } else tabId = leaf.sessionId;
    if (!tabId) {
      await closePane(activeWorkspace.focusedPaneId);
      return;
    }
    await closePaneSurface(activeWorkspace.focusedPaneId, tabId);
  }, [activeWorkspace, closePane, closePaneSurface]);

  const forkFocused = useCallback(
    async (where: ForkTarget, sourcePaneId?: string, sourceTabId?: string) => {
      if (!activeWorkspace) return;
      const paneId = sourcePaneId ?? activeWorkspace.focusedPaneId;
      const leaf = findLeaf(activeWorkspace.layout, paneId);
      if (!leaf) return;

      const forkedName = nextForkName(activeWorkspace.name, workspacesRef.current);
      const browserTabId =
        sourceTabId && isBrowserTabKey(sourceTabId) ? browserIdFromTabKey(sourceTabId) : null;
      const forkingBrowser =
        Boolean(browserTabId) || (!sourceTabId && leaf.kind === "browser" && leafHasBrowser(leaf));

      if (forkingBrowser) {
        const url =
          (browserTabId
            ? leaf.browserTabs?.find((tab) => tab.id === browserTabId)?.url
            : activeBrowserTab(leaf)?.url) ?? "";
        if (where === "workspace") {
          await createWorkspaceInternal({
            name: forkedName,
            cwd: activeWorkspace.cwd,
            branch: activeWorkspace.branch,
            agentIds: [],
            seedBrowserUrl: url.trim() || undefined,
          });
          return;
        }
        await openBrowserInFocused(paneId, where === "right" ? "beside" : "tab");
        if (url.trim()) await openBrowserWithUrl(url);
        return;
      }

      const sid = sourceTabId && !isBrowserTabKey(sourceTabId) ? sourceTabId : leaf.sessionId;
      const session = sid ? sessionsRef.current[sid] : null;
      const run = sid ? agentRuns.find((r) => r.sessionId === sid) : null;
      const bot = agentBots.find((b) => b.id === (run?.agentId ?? session?.agentId));
      // Fork carries the conversation, so prefer the resume CLI over a cold start.
      const command =
        run?.resumeCommand?.trim() ||
        (run ? resumeCommandFor(bot, run.command, agentAvailability) : undefined) ||
        session?.resumeCommand?.trim() ||
        session?.initialCommand?.trim() ||
        undefined;
      const agentId = run?.agentId ?? session?.agentId;
      const title = bot?.name || session?.title || "Shell";
      const accent: Accent = agentId && agentId !== "shell" ? "violet" : "green";

      if (where === "workspace") {
        await createWorkspaceInternal({
          name: forkedName,
          cwd: activeWorkspace.cwd,
          branch: activeWorkspace.branch,
          agentIds: [],
          seedSpawn: { title, shell: session?.shell, command, agentId, accent, forceNew: true },
        });
        return;
      }

      let targetPane = paneId;
      if (where === "right") {
        targetPane = (await splitFocused("h", paneId)) ?? paneId;
        await yieldToUi(40);
      } else if (paneId !== activeWorkspace.focusedPaneId) {
        focusPane(paneId);
      }

      // The new pane would otherwise race an idle Shell into the fork's slot.
      holdEmptyPaneSpawn(targetPane);
      try {
        if (run) {
          await resumeAgentRun(run, { forceNew: true, paneId: targetPane });
          return;
        }
        await spawnInPane({
          title,
          shell: session?.shell,
          command,
          agentId,
          accent,
          paneId: targetPane,
          mode: targetPane === paneId ? "tab" : "replace",
          forceNew: true,
        });
      } finally {
        releaseEmptyPaneSpawn(targetPane);
      }
    },
    [
      activeWorkspace,
      agentAvailability,
      agentRuns,
      createWorkspaceInternal,
      focusPane,
      holdEmptyPaneSpawn,
      openBrowserInFocused,
      openBrowserWithUrl,
      releaseEmptyPaneSpawn,
      resumeAgentRun,
      spawnInPane,
      splitFocused,
    ],
  );

  const setSplitRatio = useCallback(
    (splitId: string, ratio: number) => {
      if (!activeWorkspace) return;
      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        layout: setRatio(ws.layout, splitId, ratio),
      }));
    },
    [activeWorkspace, patchWorkspace],
  );

  const value: SpaceContextValue = useMemo(
    () => ({
      welcomeVisible,
      dismissWelcome,
      showWelcomeScreen,
      onboarded,
      skipWelcome,
      setSkipWelcome,
      takePendingPaneSpawn,
      takePendingPaneSpawnQueue,
      clearPendingPaneSpawn,
      isEmptyPaneSpawnHeld,
      shouldAutoSpawnShell,
      emptyPaneSpawnEpoch,
      workspaces,
      activeWorkspace,
      sessions,
      recentHistory,
      pushHistory,
      clearHistory,
      removeHistoryItem,
      browserUrl,
      setBrowserUrl,
      setPaneBrowserUrl,
      openBrowserInFocused,
      focusBrowserInPane,
      focusMediaInPane,
      focusTerminalInPane,
      closeBrowserTab: closeBrowserTabInPane,
      reorderPaneTabs,
      placePaneTab,
      movePaneTab,
      dockPaneTab,
      dockPane,
      openBrowserWithUrl,
      openWorkspaceInVsCodeInline,
      browserFocusMode,
      setBrowserFocusMode,
      toggleBrowserFocusMode,
      isVsCodeFocusActive,
      autoResumeAgents,
      setAutoResumeAgents,
      suggestedLocalUrl,
      suggestPreviewUrl,
      dismissSuggestedLocalUrl,
      preferredShell,
      setPreferredShell,
      locale,
      setLocale,
      theme,
      setTheme,
      t,
      agentAvailability,
      agentsScanned,
      refreshAgents,
      error,
      setError,
      isBusy,
      enterSpace,
      resetOnboarding,
      selectWorkspace,
      createWorkspace,
      updateWorkspace,
      toggleWorkspacePinned,
      removeWorkspace,
      refreshBranch,
      focusPane,
      swapPanes,
      applySnapLayout,
      snapDragToLayout,
      spawnInPane,
      spawnInFocused,
      spawnAllEmpty,
      launchAgent,
      splitFocused,
      splitShellAt,
      handleFileDropAt,
      openMediaPreviewAt,
      clearPaneMedia,
      takePendingSessionPaste,
      savedLayouts,
      saveCurrentLayoutAs,
      removeSavedLayout,
      applySavedLayout,
      openNewSpaceFromLayout,
      closeFocusedPane,
      closePane,
      closeSession,
      closePaneSurface,
      closeFocusedTab,
      equalizeSplits,
      toggleMaximizeFocusedPane,
      maximizedPaneId,
      flashPaneId,
      moveWorkspaceToTop,
      forkFocused,
      reopenClosed,
      canReopenClosed: navFlags.reopen,
      goFocusBack,
      goFocusForward,
      canFocusBack: navFlags.back,
      canFocusForward: navFlags.forward,
      renameSession,
      activatePaneSession,
      restartSession,
      clearAttention,
      focusNextAttention,
      focusAttention,
      listAttention,
      clearAllAttention,
      setSplitRatio,
      agentRuns,
      resumeAgentRun,
      resumeAgentRunAtDrop,
      removeAgentRun,
      clearAgentRuns,
    }),
    [
      welcomeVisible,
      dismissWelcome,
      showWelcomeScreen,
      onboarded,
      skipWelcome,
      setSkipWelcome,
      takePendingPaneSpawn,
      takePendingPaneSpawnQueue,
      clearPendingPaneSpawn,
      isEmptyPaneSpawnHeld,
      shouldAutoSpawnShell,
      emptyPaneSpawnEpoch,
      workspaces,
      activeWorkspace,
      sessions,
      recentHistory,
      pushHistory,
      clearHistory,
      removeHistoryItem,
      browserUrl,
      setBrowserUrl,
      setPaneBrowserUrl,
      openBrowserInFocused,
      focusBrowserInPane,
      focusMediaInPane,
      focusTerminalInPane,
      closeBrowserTabInPane,
      reorderPaneTabs,
      placePaneTab,
      movePaneTab,
      dockPaneTab,
      dockPane,
      openBrowserWithUrl,
      openWorkspaceInVsCodeInline,
      browserFocusMode,
      setBrowserFocusMode,
      toggleBrowserFocusMode,
      isVsCodeFocusActive,
      autoResumeAgents,
      setAutoResumeAgents,
      suggestedLocalUrl,
      suggestPreviewUrl,
      dismissSuggestedLocalUrl,
      preferredShell,
      setPreferredShell,
      locale,
      setLocale,
      theme,
      setTheme,
      t,
      agentAvailability,
      agentsScanned,
      refreshAgents,
      error,
      isBusy,
      enterSpace,
      resetOnboarding,
      selectWorkspace,
      createWorkspace,
      updateWorkspace,
      toggleWorkspacePinned,
      removeWorkspace,
      refreshBranch,
      focusPane,
      swapPanes,
      applySnapLayout,
      snapDragToLayout,
      spawnInPane,
      spawnInFocused,
      spawnAllEmpty,
      launchAgent,
      splitFocused,
      splitShellAt,
      handleFileDropAt,
      openMediaPreviewAt,
      clearPaneMedia,
      takePendingSessionPaste,
      savedLayouts,
      saveCurrentLayoutAs,
      removeSavedLayout,
      applySavedLayout,
      openNewSpaceFromLayout,
      closeFocusedPane,
      closePane,
      closeSession,
      closePaneSurface,
      closeFocusedTab,
      equalizeSplits,
      toggleMaximizeFocusedPane,
      maximizedPaneId,
      flashPaneId,
      moveWorkspaceToTop,
      forkFocused,
      reopenClosed,
      navFlags,
      goFocusBack,
      goFocusForward,
      renameSession,
      activatePaneSession,
      restartSession,
      clearAttention,
      focusNextAttention,
      focusAttention,
      listAttention,
      clearAllAttention,
      setSplitRatio,
      agentRuns,
      resumeAgentRun,
      resumeAgentRunAtDrop,
      removeAgentRun,
      clearAgentRuns,
    ],
  );

  const viewValue = useMemo(() => ({ view, setView }), [view, setView]);

  return (
    <SpaceContext.Provider value={value}>
      <ViewContext.Provider value={viewValue}>{children}</ViewContext.Provider>
    </SpaceContext.Provider>
  );
}

export function useSpace() {
  const ctx = useContext(SpaceContext);
  if (!ctx) throw new Error("useSpace must be used within SpaceProvider");
  return ctx;
}

export function useView() {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error("useView must be used within SpaceProvider");
  return ctx;
}
