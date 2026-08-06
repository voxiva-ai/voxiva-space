import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
import { browserClose, browserHideAll } from "@/features/browser/api";
import { extractLocalUrlFromOutput, normalizeBrowserUrl } from "@/features/browser/url";
import {
  createTask,
  loadBoard,
  saveBoard,
  type TaskPriority,
} from "@/features/board/store";
import {
  companionPushSnapshot,
  companionSetWorkspace,
  type CompanionInputEvent,
  type CompanionTaskEvent,
} from "@/features/companion/api";
import { writeTerminalSession } from "@/features/terminal/api";
import {
  agentBots,
  commandKeysForBots,
  resolveBotCommand,
} from "@/features/agents/bots";
import type { TerminalExitEvent, TerminalOutputEvent } from "@/features/terminal/types";
import {
  buildCreateLayout,
  buildGridLayout,
  buildSnapLayout,
  collectLeaves,
  collectPaneIds,
  collectSessionIds,
  countLeaves,
  createLeaf,
  equalizeLayout,
  expandLayoutToCount,
  findLeaf,
  findPaneForSession,
  firstPaneId,
  type GridPreset,
  type SnapLayoutId,
  removePane,
  clampLayoutRatios,
  setLeafBrowser,
  setLeafSession,
  setRatio,
  shrinkLayoutToCount,
  splitPane,
  swapPaneContents,
} from "./layout";
import { loadPersisted, savePersisted, type ThemeId } from "./persist";
import { translate, type Locale, type MsgKey } from "@/i18n";
import { playNotifySound } from "@/features/sounds/prefs";
import { syncWindowGlass } from "@/features/theme/windowGlass";

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

type SpaceContextValue = {
  onboarded: boolean;
  view: ViewId;
  setView: (view: ViewId) => void;
  setEditorDirty: (dirty: boolean) => void;
  takePendingPaneSpawn: (paneId: string) => SpawnOptions | null;
  clearPendingPaneSpawn: (paneId: string) => void;
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
  openBrowserInFocused: () => Promise<void>;
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
  resetOnboarding: () => void | Promise<void>;
  selectWorkspace: (id: string) => void;
  createWorkspace: (opts: CreateWorkspaceOptions) => Promise<void>;
  updateWorkspace: (id: string, patch: Partial<Pick<Workspace, "name" | "cwd">>) => Promise<void>;
  removeWorkspace: (id: string) => Promise<void>;
  refreshBranch: (id: string) => Promise<void>;
  focusPane: (paneId: string) => void;
  swapPanes: (fromPaneId: string, toPaneId: string) => void;
  applySnapLayout: (id: SnapLayoutId, primaryPaneId?: string) => Promise<void>;
  spawnInPane: (opts: SpawnOptions) => Promise<string | null>;
  spawnInFocused: (opts: SpawnOptions) => Promise<string | null>;
  spawnAllEmpty: () => Promise<void>;
  launchAgent: (opts: SpawnOptions) => Promise<string | null>;
  splitFocused: (direction: SplitDirection) => Promise<void>;
  closeFocusedPane: () => Promise<void>;
  closePane: (paneId: string) => Promise<void>;
  closeSession: (sessionId: string) => Promise<void>;
  restartSession: (sessionId: string) => Promise<void>;
  clearAttention: (sessionId: string) => void;
  setSplitRatio: (splitId: string, ratio: number) => void;
};

const SpaceContext = createContext<SpaceContextValue | null>(null);

function hydrateLayout(raw: unknown): SplitNode {
  if (!raw || typeof raw !== "object") return createLeaf(null);
  const node = raw as Record<string, unknown>;
  if (node.type === "leaf" && typeof node.paneId === "string") {
    const kind = node.kind === "browser" ? "browser" : "terminal";
    return {
      type: "leaf",
      paneId: node.paneId,
      kind,
      sessionId: null,
      // Never restore a saved page into a browser pane — always blank start.
      browserUrl: null,
    };
  }
  if (node.type === "split" && node.first && node.second) {
    return clampLayoutRatios({
      type: "split",
      id: typeof node.id === "string" ? node.id : uid("split"),
      direction: node.direction === "v" ? "v" : "h",
      ratio: typeof node.ratio === "number" ? node.ratio : 0.5,
      first: hydrateLayout(node.first),
      second: hydrateLayout(node.second),
    });
  }
  return createLeaf(null);
}

export function SpaceProvider({ children }: { children: ReactNode }) {
  const persisted = useMemo(() => loadPersisted(), []);
  // Always land on welcome on cold start; Enter Space continues into the app.
  const [onboarded, setOnboarded] = useState(false);
  const [view, setViewState] = useState<ViewId>("space");
  const viewRef = useRef<ViewId>("space");
  const viewTransitionRef = useRef(0);
  const editorDirtyRef = useRef(false);
  const pendingPaneSpawnsRef = useRef(new Map<string, SpawnOptions>());
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    if (persisted?.workspaces?.length) {
      return persisted.workspaces.map((w, index) => {
        const layout = hydrateLayout(w.layout);
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
  const [sessions, setSessions] = useState<Record<string, TerminalSession>>({});
  const [recentHistory, setRecentHistory] = useState<HistoryItem[]>(
    () => persisted?.recentHistory ?? [],
  );
  // Always start blank — never auto-open a saved site (store.ql, vercel, etc.).
  const [browserUrl, setBrowserUrl] = useState("");
  const [suggestedLocalUrl, setSuggestedLocalUrl] = useState<string | null>(null);
  const lastSuggestedUrlRef = useRef<string | null>(null);
  const [preferredShell, setPreferredShell] = useState(() => persisted?.preferredShell ?? "");
  const [locale, setLocale] = useState<Locale>(() =>
    persisted?.locale === "en" || persisted?.locale === "ru" ? persisted.locale : "en",
  );
  const [theme, setTheme] = useState<ThemeId>(() =>
    (
      ["default", "dracula", "dark", "gruvbox", "cyber", "glass", "light"] as ThemeId[]
    ).includes(persisted?.theme as ThemeId)
      ? persisted!.theme
      : "default",
  );
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
      setViewState(next);
      // Don't block navigation on browser IPC — hide in background.
      void browserHideAll().catch(() => undefined);
    },
    [confirmLeaveEditor],
  );

  const takePendingPaneSpawn = useCallback((paneId: string) => {
    return pendingPaneSpawnsRef.current.get(paneId) ?? null;
  }, []);

  const clearPendingPaneSpawn = useCallback((paneId: string) => {
    pendingPaneSpawnsRef.current.delete(paneId);
  }, []);
  const [agentAvailability, setAgentAvailability] = useState<AgentAvailability>({});
  const [agentsScanned, setAgentsScanned] = useState(false);
  const [error, setError] = useState("");
  const [isBusy] = useState(false);

  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme =
      theme === "light" ? "light" : "dark";
    void syncWindowGlass(theme);
  }, [theme]);

  useEffect(() => {
    savePersisted({
      onboarded,
      workspaces: workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        cwd: w.cwd,
        branch: w.branch,
        color: w.color,
        layout: w.layout,
        focusedPaneId: w.focusedPaneId,
      })),
      activeWorkspaceId: activeWorkspace?.id ?? null,
      browserUrl: "",
      preferredShell,
      locale,
      theme,
      recentHistory,
    });
  }, [
    onboarded,
    workspaces,
    activeWorkspace?.id,
    browserUrl,
    preferredShell,
    locale,
    theme,
    recentHistory,
  ]);

  const refreshAgents = useCallback(async () => {
    try {
      const map = await checkCommands(commandKeysForBots());
      setAgentAvailability(map);
      setAgentsScanned(true);
    } catch {
      // Keep last known map — never mark everything missing/installed on a scan glitch.
    }
  }, []);

  useEffect(() => {
    void refreshAgents();
  }, [refreshAgents]);

  const patchWorkspace = useCallback((id: string, updater: (ws: Workspace) => Workspace) => {
    setWorkspaces((current) => current.map((ws) => (ws.id === id ? updater(ws) : ws)));
  }, []);

  const markAttention = useCallback((sessionId: string) => {
    let shouldPlay = false;
    setSessions((current) => {
      const session = current[sessionId];
      if (!session || session.needsAttention) return current;
      shouldPlay = true;
      return { ...current, [sessionId]: { ...session, needsAttention: true } };
    });
    if (!shouldPlay) return;
    let workspaceId: string | null = null;
    for (const ws of workspacesRef.current) {
      if (findPaneForSession(ws.layout, sessionId)) {
        workspaceId = ws.id;
        break;
      }
    }
    playNotifySound("attention", {
      workspaceId,
      activeWorkspaceId: activeWorkspaceIdRef.current,
    });
  }, []);

  useEffect(() => {
    const unlistenOutput = listen<TerminalOutputEvent>("terminal://output", (event) => {
      const data = event.payload.data;
      if (
        /\x1b\](9|99|777)/.test(data) ||
        /\b(Waiting for input|Do you want to|Press enter|\[y\/N\]|Awaiting)/i.test(data)
      ) {
        markAttention(event.payload.id);
      }
      const local = extractLocalUrlFromOutput(data);
      if (local && local !== lastSuggestedUrlRef.current) {
        lastSuggestedUrlRef.current = local;
        setSuggestedLocalUrl(local);
      }
    });
    const unlistenExit = listen<TerminalExitEvent>("terminal://exit", (event) => {
      const sessionId = event.payload.id;
      setSessions((current) => {
        const session = current[sessionId];
        if (!session) return current;
        return {
          ...current,
          [sessionId]: { ...session, status: "closed", needsAttention: false },
        };
      });
      let workspaceId: string | null = null;
      for (const ws of workspacesRef.current) {
        if (findPaneForSession(ws.layout, sessionId)) {
          workspaceId = ws.id;
          break;
        }
      }
      playNotifySound("exit", {
        workspaceId,
        activeWorkspaceId: activeWorkspaceIdRef.current,
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
  }, [markAttention]);

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

  const selectWorkspace = useCallback(
    (id: string) => {
      if (id !== activeWorkspaceId && view === "editor" && !confirmLeaveEditor()) return;
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
    [activeWorkspaceId, confirmLeaveEditor, pushHistory, view],
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
      };
      setWorkspaces((current) => [...current, ws]);
      setActiveWorkspaceId(ws.id);
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
      const workspace = activeWorkspace;
      if (!workspace) return null;
      const paneId = opts.paneId ?? workspace.focusedPaneId;
      const leaf = findLeaf(workspace.layout, paneId);
      if (!leaf) return null;

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
        };
        setSessions((current) => {
          const next = { ...current, [session.id]: session };
          if (leaf.sessionId && leaf.sessionId !== session.id) {
            void killTerminalSession(leaf.sessionId).catch(() => undefined);
            delete next[leaf.sessionId];
          }
          return next;
        });
        patchWorkspace(workspace.id, (ws) => ({
          ...ws,
          layout: setLeafSession(ws.layout, paneId, session.id),
          focusedPaneId: paneId,
        }));
        return created.id;
      } catch (err) {
        setError(clientError(err));
        return null;
      }
    },
    [activeWorkspace, patchWorkspace, preferredShell],
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
      if (leaf && leaf.kind !== "browser" && !leaf.sessionId) {
        await enqueueTerminalSpawn(async () => {
          await yieldToUi();
          return spawnInPane({ title: "Shell", paneId, accent: "green" });
        });
      }
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

  const openBrowserInFocused = useCallback(async () => {
    if (!activeWorkspace) return;
    const paneId = activeWorkspace.focusedPaneId;
    const leaf = findLeaf(activeWorkspace.layout, paneId);
    if (!leaf) return;

    // Already a browser pane — stay in space, user loads URL manually.
    if (leaf.kind === "browser") {
      setView("space");
      return;
    }

    // Like cmux/BridgeSpace: open blank browser in a right split on demand.
    if (countLeaves(activeWorkspace.layout) < MAX_PANES) {
      const nextLayout = equalizeLayout(splitPane(activeWorkspace.layout, paneId, "h", null));
      const newLeafId = (() => {
        const walk = (node: SplitNode): string | null => {
          if (node.type === "leaf") return null;
          const inFirst = findLeaf(node.first, paneId);
          if (
            inFirst &&
            node.second.type === "leaf" &&
            node.second.kind === "terminal" &&
            !node.second.sessionId
          ) {
            return node.second.paneId;
          }
          return walk(node.first) || walk(node.second);
        };
        return walk(nextLayout);
      })();
      if (newLeafId) {
        patchWorkspace(activeWorkspace.id, (ws) => ({
          ...ws,
          layout: setLeafBrowser(nextLayout, newLeafId, ""),
          focusedPaneId: newLeafId,
        }));
        setView("space");
        return;
      }
    }

    if (leaf.sessionId) {
      try {
        await killTerminalSession(leaf.sessionId);
      } catch {
        // ignore
      }
      setSessions((current) => {
        const next = { ...current };
        delete next[leaf.sessionId!];
        return next;
      });
    }
    patchWorkspace(activeWorkspace.id, (ws) => ({
      ...ws,
      layout: setLeafBrowser(ws.layout, paneId, ""),
      focusedPaneId: paneId,
    }));
    setView("space");
  }, [activeWorkspace, patchWorkspace]);

  const openBrowserWithUrl = useCallback(
    async (rawUrl: string) => {
      if (!activeWorkspace) return;
      const url = normalizeBrowserUrl(rawUrl);
      if (!url) return;
      setBrowserUrl(url);
      setSuggestedLocalUrl(null);

      const focused = findLeaf(activeWorkspace.layout, activeWorkspace.focusedPaneId);
      if (focused?.kind === "browser") {
        patchWorkspace(activeWorkspace.id, (ws) => ({
          ...ws,
          layout: setLeafBrowser(ws.layout, focused.paneId, url),
        }));
        setView("space");
        return;
      }

      // Prefer assist browser tab so the terminal grid stays intact.
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
    setSuggestedLocalUrl(next);
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
    const push = () => {
      const sessionToWorkspace = new Map<string, string>();
      for (const ws of workspaces) {
        const walk = (node: SplitNode) => {
          if (node.type === "leaf") {
            if (node.sessionId) sessionToWorkspace.set(node.sessionId, ws.id);
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
        })),
        sessions: Object.values(sessions).map((session) => ({
          id: session.id,
          title: session.title,
          status: session.status,
          needsAttention: session.needsAttention,
          workspaceId: sessionToWorkspace.get(session.id) ?? null,
        })),
      }).catch(() => undefined);
    };
    push();
    const timer = window.setInterval(push, 2500);
    return () => window.clearInterval(timer);
  }, [sessions, workspaces]);

  const enterSpace = useCallback(
    async (opts: EnterSpaceOptions) => {
      const cwd = opts.cwd.trim() || (await getDefaultTerminalCwd().catch(() => "."));
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
        name: opts.name.trim() || "My Space",
        cwd,
        branch,
        color: "green",
        layout,
        focusedPaneId: firstPaneId(layout),
      };
      setWorkspaces([ws]);
      setActiveWorkspaceId(ws.id);
      setOnboarded(true);
      setView("space");
      setError("");
      pushHistory({
        workspaceId: ws.id,
        workspaceName: ws.name,
        cwd: ws.cwd,
      });
      void refreshAgents();
    },
    [agentAvailability, pushHistory, refreshAgents, setView],
  );

  const launchAgent = useCallback(
    async (opts: SpawnOptions) => {
      const missing = Boolean(
        opts.command && agentsScanned && agentAvailability[opts.command] !== true,
      );
      setView("space");
      const workspace = activeWorkspace;
      if (!workspace) {
        if (missing) setError(t("agents.missingHint"));
        return null;
      }

      let layout = workspace.layout;
      const leaves = collectLeaves(layout);
      let paneId =
        leaves.find((leaf) => (leaf.kind ?? "terminal") !== "browser" && !leaf.sessionId)?.paneId ??
        null;

      // Free pane missing → open a new split. Never kill an existing terminal.
      if (!paneId && countLeaves(layout) < MAX_PANES) {
        const before = new Set(collectPaneIds(layout));
        layout = equalizeLayout(splitPane(layout, workspace.focusedPaneId, "h", null));
        paneId = collectPaneIds(layout).find((id) => !before.has(id)) ?? null;
      }

      if (!paneId) {
        setError(missing ? t("agents.missingHint") : t("agents.noFreePane"));
        return null;
      }

      setError("");
      try {
        const shell = opts.shell ?? (preferredShell.trim() || null);
        const created = await createTerminalSession({
          cwd: workspace.cwd || null,
          shell,
          title: opts.title || opts.command || "Agent",
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
        };
        setSessions((current) => ({ ...current, [session.id]: session }));
        patchWorkspace(workspace.id, () => ({
          ...workspace,
          layout: setLeafSession(layout, paneId!, session.id),
          focusedPaneId: paneId!,
        }));
        return created.id;
      } catch (err) {
        setError(clientError(err));
        if (missing) setError(t("agents.missingHint"));
        return null;
      }
    },
    [activeWorkspace, agentAvailability, agentsScanned, patchWorkspace, preferredShell, t],
  );

  const resetOnboarding = useCallback(async () => {
    const ids = Object.keys(sessions);
    for (const sessionId of ids) {
      try {
        await killTerminalSession(sessionId);
      } catch {
        // already dead
      }
    }
    setSessions({});
    setWorkspaces([]);
    setActiveWorkspaceId(null);
    setOnboarded(false);
    setError("");
  }, [sessions]);

  const updateWorkspace = useCallback(
    async (id: string, patch: Partial<Pick<Workspace, "name" | "cwd">>) => {
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
      if (leaf?.sessionId) {
        setSessions((current) => {
          const session = current[leaf.sessionId!];
          if (!session?.needsAttention) return current;
          return { ...current, [session.id]: { ...session, needsAttention: false } };
        });
      }
    },
    [activeWorkspace, patchWorkspace],
  );

  const swapPanes = useCallback(
    (fromPaneId: string, toPaneId: string) => {
      if (!activeWorkspace) return;
      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        layout: swapPaneContents(ws.layout, fromPaneId, toPaneId),
        focusedPaneId: toPaneId,
      }));
    },
    [activeWorkspace, patchWorkspace],
  );

  const applySnapLayout = useCallback(
    async (id: SnapLayoutId, primaryPaneId?: string) => {
      if (!activeWorkspace) return;
      const oldLeaves = [...collectLeaves(activeWorkspace.layout)];
      if (oldLeaves.length === 0) return;
      if (primaryPaneId) {
        const idx = oldLeaves.findIndex((leaf) => leaf.paneId === primaryPaneId);
        if (idx > 0) {
          const [primary] = oldLeaves.splice(idx, 1);
          oldLeaves.unshift(primary);
        }
      }

      // Snap is arrangement only — never destroy existing panes/sessions.
      let layout = buildSnapLayout(id);
      const need = oldLeaves.length;
      if (countLeaves(layout) < need) layout = expandLayoutToCount(layout, need);
      else if (countLeaves(layout) > need) layout = shrinkLayoutToCount(layout, need);

      const paneIds = collectPaneIds(layout);
      for (let i = 0; i < oldLeaves.length; i += 1) {
        const prev = oldLeaves[i];
        const paneId = paneIds[i];
        if (!prev || !paneId) continue;
        if (prev.kind === "browser") {
          layout = setLeafBrowser(layout, paneId, prev.browserUrl || browserUrl || null);
        } else {
          layout = setLeafSession(layout, paneId, prev.sessionId);
        }
      }

      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        layout: clampLayoutRatios(layout),
        focusedPaneId: paneIds[0] ?? firstPaneId(layout),
      }));
    },
    [activeWorkspace, browserUrl, patchWorkspace],
  );

  const splitFocused = useCallback(
    async (direction: SplitDirection) => {
      if (!activeWorkspace) return;
      if (countLeaves(activeWorkspace.layout) >= MAX_PANES) {
        setError(`You can open up to ${MAX_PANES} panes in one workspace.`);
        return;
      }
      const paneId = activeWorkspace.focusedPaneId;
      const nextLayout = equalizeLayout(splitPane(activeWorkspace.layout, paneId, direction, null));
      const newLeaf = (() => {
        const walk = (node: SplitNode): string | null => {
          if (node.type === "leaf") return null;
          const inFirst = findLeaf(node.first, paneId);
          if (inFirst && node.second.type === "leaf" && !node.second.sessionId) {
            return node.second.paneId;
          }
          return walk(node.first) || walk(node.second);
        };
        return walk(nextLayout);
      })();
      patchWorkspace(activeWorkspace.id, (ws) => ({
        ...ws,
        layout: nextLayout,
        focusedPaneId: newLeaf ?? ws.focusedPaneId,
      }));
    },
    [activeWorkspace, patchWorkspace],
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
        return { ...ws, layout: setLeafSession(ws.layout, paneId, null) };
      }),
    );
  }, []);

  const closePane = useCallback(
    async (paneId: string) => {
      if (!activeWorkspace) return;
      const leaf = findLeaf(activeWorkspace.layout, paneId);
      if (leaf?.kind === "browser") {
        await browserClose(`browser-${paneId}`).catch(() => undefined);
      }
      if (leaf?.sessionId) {
        try {
          await killTerminalSession(leaf.sessionId);
        } catch {
          // ignore
        }
        setSessions((current) => {
          const next = { ...current };
          delete next[leaf.sessionId!];
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
        await spawnInPane({
          paneId,
          title: session.title,
          shell: preferredShell.trim() || null,
          accent: session.accent,
        });
      }
    },
    [activeWorkspace, preferredShell, sessions, spawnInPane],
  );

  const clearAttention = useCallback((sessionId: string) => {
    setSessions((current) => {
      const session = current[sessionId];
      if (!session) return current;
      return { ...current, [sessionId]: { ...session, needsAttention: false } };
    });
  }, []);

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

  const value: SpaceContextValue = {
    onboarded,
    view,
    setView,
    setEditorDirty,
    takePendingPaneSpawn,
    clearPendingPaneSpawn,
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
    removeWorkspace,
    refreshBranch,
    focusPane,
    swapPanes,
    applySnapLayout,
    spawnInPane,
    spawnInFocused,
    spawnAllEmpty,
    launchAgent,
    splitFocused,
    closeFocusedPane,
    closePane,
    closeSession,
    restartSession,
    clearAttention,
    setSplitRatio,
  };

  return <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>;
}

export function useSpace() {
  const ctx = useContext(SpaceContext);
  if (!ctx) throw new Error("useSpace must be used within SpaceProvider");
  return ctx;
}
