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
import { listen } from "@tauri-apps/api/event";
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
  killTerminalSession,
} from "@/features/terminal/api";
import { enqueueTerminalSpawn, yieldToUi } from "@/features/terminal/spawnQueue";
import {
  outputNeedsAttention,
} from "@/features/attention/prefs";
import {
  clearAttentionNotifyState,
  notifyAttention,
  notifySessionExit,
  shouldScanOutputForAttention,
} from "@/features/attention/notify";
import { browserClose, browserHideAll } from "@/features/browser/api";
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
  agentBots,
  commandKeysForBots,
  isBotReady,
  resolveBotCommand,
  resumeCommandFor,
} from "@/features/agents/bots";
import {
  detectAgentFromOutput,
  isIdleShellTitle,
  agentIdForSession,
  agentIdFromCommand,
} from "@/features/agents/sessionAgent";
import type { TerminalExitEvent, TerminalOutputEvent } from "@/features/terminal/types";
import {
  buildCreateLayout,
  buildGridLayout,
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
  reorderLeafTabs,
  placeLeafTab,
  dockTab,
  BROWSER_TAB,
  MEDIA_TAB,
  leafHasBrowser,
  leafSurfaceCount,
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
import { isPreviewDropPath, openWorkspaceFilePreview } from "./workspaceFileDrop";

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
};

function isSpaceColor(value: unknown): value is SpaceColor {
  return typeof value === "string" && (SPACE_COLORS as string[]).includes(value);
}

function pickSpaceColor(existing: Workspace[], preferred?: SpaceColor): SpaceColor {
  if (preferred && isSpaceColor(preferred)) return preferred;
  const used = new Set(existing.map((ws) => ws.color));
  const free = SPACE_COLORS.find((c) => !used.has(c));
  return free ?? SPACE_COLORS[existing.length % SPACE_COLORS.length];
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
        paneId: leaf.paneId,
      });
    } else {
      target.set(leaf.paneId, {
        title: "Shell",
        accent: "green",
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
  setEditorDirty: (dirty: boolean) => void;
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
  setPaneBrowserUrl: (paneId: string, url: string) => void;
  openBrowserInFocused: (
    paneId?: string,
    mode?: "tab" | "beside" | "below" | "left" | "above" | "root",
  ) => Promise<void>;
  /** Focus existing browser tab — never spawns a second pane. */
  focusBrowserInPane: (paneId?: string) => void;
  focusMediaInPane: (paneId?: string) => void;
  focusTerminalInPane: (paneId?: string) => Promise<void>;
  closeBrowserTab: (paneId: string) => void;
  reorderPaneTabs: (paneId: string, fromId: string, toId: string) => void;
  placePaneTab: (paneId: string, tabId: string, beforeId: string | null) => void;
  /** Drag a shell/browser tab onto another pane — keeps the live session / URL. */
  movePaneTab: (fromPaneId: string, toPaneId: string, tabId: string) => void;
  /** Drag a tab to a pane edge to split, or center to merge. */
  dockPaneTab: (fromPaneId: string, toPaneId: string, tabId: string, zone: DropZone) => void;
  dockPane: (fromPaneId: string, toPaneId: string, zone: DropZone) => void;
  openBrowserWithUrl: (url: string) => Promise<void>;
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
  splitFocused: (direction: SplitDirection, paneId?: string) => Promise<void>;
  /** Split a new shell onto an edge of the pane. */
  splitShellAt: (paneId: string, zone: Exclude<DropZone, "center">) => Promise<void>;
  /** Route Finder / clipboard file drop onto a pane zone (cmux-style). */
  handleFileDropAt: (
    paneId: string,
    zone: DropZone,
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
  renameSession: (sessionId: string, title: string) => void;
  activatePaneSession: (paneId: string, sessionId: string) => void;
  restartSession: (sessionId: string) => Promise<void>;
  clearAttention: (sessionId: string) => void;
  /** Cycle to the next pane/session that needs attention (unread). */
  focusNextAttention: () => boolean;
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
    const kind =
      node.kind === "browser"
        ? "browser"
        : node.kind === "media" ||
            (typeof node.mediaPath === "string" && node.mediaPath) ||
            (Array.isArray(node.tabOrder) && node.tabOrder.includes("__media__"))
          ? "media"
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
      // Keep a browser tab if this pane had one; never restore the last URL.
      browserUrl:
        node.kind === "browser" ||
        typeof node.browserUrl === "string" ||
        (Array.isArray(node.tabOrder) && node.tabOrder.includes("__browser__"))
          ? ""
          : null,
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
  const editorDirtyRef = useRef(false);
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
  const [recentHistory, setRecentHistory] = useState<HistoryItem[]>(
    () => persisted?.recentHistory ?? [],
  );
  const [savedLayouts, setSavedLayouts] = useState<SavedWorkspaceLayout[]>(() =>
    normalizeSavedLayouts(persisted?.savedLayouts),
  );
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>(() => persisted?.agentRuns ?? []);
  // Always start blank — never auto-open a saved site (store.ql, vercel, etc.).
  const [browserUrl, setBrowserUrl] = useState("");
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

  const setEditorDirty = useCallback((dirty: boolean) => {
    editorDirtyRef.current = dirty;
  }, []);

  const confirmLeaveEditor = useCallback(() => {
    if (!editorDirtyRef.current) return true;
    return window.confirm(t("editor.leaveDirty"));
  }, [t]);

  const setView = useCallback(
    (next: ViewId) => {
      const current = viewRef.current;
      if (current === next) return;
      if (current === "editor" && next !== "editor" && !confirmLeaveEditor()) return;
      ++viewTransitionRef.current;
      if (next !== "editor") editorDirtyRef.current = false;
      viewRef.current = next;
      // Don't block navigation on browser IPC — hide in background.
      void browserHideAll().catch(() => undefined);
      startTransition(() => {
        setViewState(next);
      });
    },
    [confirmLeaveEditor],
  );

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
    if (leaf.mediaPath || leaf.browserUrl !== null) return false;
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
      let shouldMark = false;
      let title = "Shell";
      setSessions((current) => {
        const session = current[sessionId];
        if (!session || session.needsAttention) return current;
        shouldMark = true;
        title = session.title || "Shell";
        return { ...current, [sessionId]: { ...session, needsAttention: true } };
      });
      if (!shouldMark) return;

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
      if (id !== activeWorkspaceId && viewRef.current === "editor" && !confirmLeaveEditor()) return;
      setActiveWorkspaceId(id);
      setWorkspaces((current) => {
        const target = current.find((ws) => ws.id === id);
        if (target) {
          pushHistory({
            workspaceId: target.id,
            workspaceName: target.name,
            cwd: target.cwd,
          });
        }
        return current;
      });
      setViewState((current) => (current === "editor" ? "editor" : "space"));
    },
    [activeWorkspaceId, confirmLeaveEditor, pushHistory],
  );

  const createWorkspace = useCallback(
    async (opts: CreateWorkspaceOptions) => {
      const grid = resolveGrid(opts);
      const layout = buildCreateLayout(grid, Boolean(opts.includeBrowser));
      queuePaneSpawns(
        pendingPaneSpawnsRef.current,
        layout,
        opts.agentIds,
        agentAvailability,
      );
      let branch: string | null = null;
      const cwd = opts.cwd.trim() || ".";
      try {
        branch = await getGitBranch(cwd);
      } catch {
        branch = null;
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
    },
    [agentAvailability, pushHistory, setView, workspaces],
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
        const created = await createTerminalSession({
          cwd: workspace.cwd || null,
          shell,
          title: opts.title,
          cols: PTY_COLS,
          rows: PTY_ROWS,
          initialCommand: opts.command?.trim() || null,
        });
        const session: TerminalSession = {
          id: created.id,
          title: created.title,
          cwd: created.cwd || workspace.cwd,
          shell: created.shell,
          status: "online",
          accent: opts.accent ?? "green",
          needsAttention: false,
          initialCommand: opts.command?.trim() || undefined,
          agentId: opts.agentId ?? agentIdFromCommand(opts.command) ?? undefined,
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
            ? addLeafSession(ws.layout, paneId, session.id)
            : setLeafSession(ws.layout, paneId, session.id),
          focusedPaneId: paneId,
        }));
        if (opts.paste?.trim()) {
          window.setTimeout(() => {
            void writeTerminalSession(created.id, opts.paste!).catch(() => undefined);
          }, 80);
        }
        return created.id;
      } catch (err) {
        setError(clientError(err));
        return null;
      }
    },
    [activeWorkspace, patchWorkspace, preferredShell],
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
    for (const paneId of panes) {
      const leaf = findLeaf(activeWorkspace.layout, paneId);
      if (!leaf) continue;
      if (leaf.kind === "browser" || leaf.kind === "media") continue;
      if (leaf.mediaPath || leaf.browserUrl !== null) continue;
      if (leafTabIds(leaf).length > 0) continue;
      await enqueueTerminalSpawn(async () => {
        await yieldToUi(40);
        return spawnInPane({ title: "Shell", paneId, accent: "green", mode: "replace" });
      });
    }
  }, [activeWorkspace, spawnInPane]);

  const setPaneBrowserUrl = useCallback(
    (paneId: string, url: string) => {
      if (!activeWorkspace) return;
      setBrowserUrl(url);
      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        layout: setLeafBrowser(ws.layout, paneId, url),
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
    (targetPaneId?: string) => {
      if (!activeWorkspace) return;
      const paneId = targetPaneId ?? activeWorkspace.focusedPaneId;
      if (!findLeaf(activeWorkspace.layout, paneId)) return;
      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        layout: openBrowserTab(ws.layout, paneId),
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
    (paneId: string) => {
      if (!activeWorkspace) return;
      const leaf = findLeaf(activeWorkspace.layout, paneId);
      if (!leaf) return;
      void browserClose(`browser-${paneId}`).catch(() => undefined);
      const tabs = leafTabIds(leaf);
      if (tabs.length === 0) {
        // Browser-only — drop the leaf (same as close pane without awaiting).
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
        layout: closeBrowserTab(ws.layout, paneId),
        focusedPaneId: paneId,
      }));
    },
    [activeWorkspace, patchWorkspace],
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
            if (leafHasBrowser(node) && (node.browserUrl || "").trim()) {
              browsers.push({
                workspaceId: ws.id,
                paneId: node.paneId,
                url: node.browserUrl || "",
                title: ws.name,
              });
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

      const layout = buildGridLayout(opts.grid);
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
      if (patch.cwd) {
        try {
          branch = await getGitBranch(patch.cwd);
        } catch {
          branch = null;
        }
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
    [workspaces],
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
    [activeWorkspace, patchWorkspace],
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
      if (!activeWorkspace) return;
      if (countLeaves(activeWorkspace.layout) >= MAX_PANES) {
        setError(`You can open up to ${MAX_PANES} panes in one workspace.`);
        return;
      }
      const paneId = targetPaneId ?? activeWorkspace.focusedPaneId;
      if (!findLeaf(activeWorkspace.layout, paneId)) return;

      const added = addShellBeside(activeWorkspace.layout, paneId, direction);
      if (!added) return;
      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        layout: added.layout,
        focusedPaneId: added.paneId,
      }));
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
      zone: DropZone,
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
      if (previewPath) {
        focusPane(paneId);
        setView("space");
        if (opts?.shiftKey) {
          openWorkspaceFilePreview(previewPath);
        } else {
          openMediaPreviewAt(paneId, zone, previewPath);
        }
        return;
      }

      if (!pastePayload.trim()) return;
      const leaf = findLeaf(activeWorkspace.layout, paneId);
      if (!leaf) return;
      focusPane(paneId);
      setView("space");

      if (zone !== "center") {
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

      const tabs = leafTabIds(leaf);
      const sessionId =
        leaf.sessionId && tabs.includes(leaf.sessionId) ? leaf.sessionId : (tabs[0] ?? null);
      const session = sessionId ? sessions[sessionId] : null;

      if (session?.status === "online" && sessionId) {
        activatePaneSession(paneId, sessionId);
        void writeTerminalSession(sessionId, pastePayload).catch(() => undefined);
        return;
      }

      if (sessionId && session) {
        pendingSessionPasteRef.current.set(sessionId, pastePayload);
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
    [activeWorkspace, activatePaneSession, focusPane, openMediaPreviewAt, patchWorkspace, sessions, setView],
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

  const closeSession = useCallback(async (sessionId: string) => {
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
  }, []);

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
      if (leaf && leafHasBrowser(leaf)) {
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
    [activeWorkspace, patchWorkspace],
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
      if (tabId === BROWSER_TAB) {
        closeBrowserTabInPane(paneId);
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
        const command = session.initialCommand === "codex"
          ? "codex resume --last"
          : session.initialCommand;
        await spawnInPane({
          paneId,
          title: session.title,
          shell: session.shell || preferredShell.trim() || null,
          accent: session.accent,
          command,
          mode: "tab",
        });
      }
    },
    [activeWorkspace, patchWorkspace, preferredShell, sessions, spawnInPane],
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
        const command =
          session.initialCommand === "codex" ? "codex resume --last" : session.initialCommand;
        const created = await createTerminalSession({
          cwd: session.cwd || activeWorkspace.cwd || null,
          shell: session.shell || preferredShell.trim() || null,
          title: session.title,
          cols: PTY_COLS,
          rows: PTY_ROWS,
          initialCommand: command?.trim() || null,
        });
        const nextSession: TerminalSession = {
          id: created.id,
          title: created.title,
          cwd: created.cwd || session.cwd,
          shell: created.shell,
          status: "online",
          accent: session.accent,
          needsAttention: false,
          initialCommand: session.initialCommand,
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
      } catch (err) {
        setSessions((current) => ({
          ...current,
          [sessionId]: { ...session, status: "error" },
        }));
        setError(clientError(err));
      }
    },
    [activeWorkspace, patchWorkspace, preferredShell, setError],
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
      void enqueueTerminalSpawn(() => restoreSession(id));
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

  const focusNextAttention = useCallback(() => {
    type Target = { workspaceId: string; paneId: string; sessionId: string };
    const targets: Target[] = [];
    for (const ws of workspaces) {
      for (const leaf of collectLeaves(ws.layout)) {
        for (const sessionId of leafTabIds(leaf)) {
          if (sessions[sessionId]?.needsAttention) {
            targets.push({ workspaceId: ws.id, paneId: leaf.paneId, sessionId });
          }
        }
      }
    }
    if (!targets.length) return false;

    const focusedLeaf = activeWorkspace
      ? findLeaf(activeWorkspace.layout, activeWorkspace.focusedPaneId)
      : null;
    const focusedSession = focusedLeaf?.sessionId ?? null;
    let idx = focusedSession ? targets.findIndex((t) => t.sessionId === focusedSession) : -1;
    if (idx < 0 && activeWorkspace) {
      idx = targets.findIndex((t) => t.workspaceId === activeWorkspace.id);
    }
    const next = targets[(idx + 1) % targets.length]!;

    setView("space");
    if (next.workspaceId !== activeWorkspace?.id) {
      setActiveWorkspaceId(next.workspaceId);
    }
    patchWorkspace(next.workspaceId, (ws) => ({
      ...ws,
      layout: activateLeafSession(ws.layout, next.paneId, next.sessionId),
      focusedPaneId: next.paneId,
    }));
    setSessions((current) => {
      const session = current[next.sessionId];
      if (!session?.needsAttention) return current;
      return { ...current, [next.sessionId]: { ...session, needsAttention: false } };
    });
    return true;
  }, [activeWorkspace, patchWorkspace, sessions, setView, workspaces]);

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
      setEditorDirty,
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
      renameSession,
      activatePaneSession,
      restartSession,
      clearAttention,
      focusNextAttention,
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
      setEditorDirty,
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
      renameSession,
      activatePaneSession,
      restartSession,
      clearAttention,
      focusNextAttention,
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
