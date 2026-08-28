import type { AgentRun } from "@/lib/types";
import type { ThemeId } from "@/features/theme";

export type { ThemeId } from "@/features/theme";

const STORAGE_KEY = "voxiva-space-state-v1";
export const MAX_AGENT_RUNS = 500;

export type PersistedHistoryItem = {
  workspaceId: string;
  workspaceName: string;
  cwd: string;
  at: number;
};

export type PersistedState = {
  onboarded: boolean;
  /** When true, skip the welcome screen and open the workspace shell directly. */
  skipWelcome?: boolean;
  workspaces: Array<{
    id: string;
    name: string;
    cwd: string;
    branch: string | null;
    color?: string;
    layout: unknown;
    focusedPaneId: string;
    pinned?: boolean;
    shellPresets?: Array<{
      id: string;
      title: string;
      command?: string;
    }>;
  }>;
  activeWorkspaceId: string | null;
  browserUrl: string;
  preferredShell: string;
  locale: "ru" | "en";
  theme: ThemeId;
  recentHistory: PersistedHistoryItem[];
  /** Recent agent runs, newest first (capped at MAX_AGENT_RUNS). */
  agentRuns?: AgentRun[];
  /** Live PTYs cannot survive an app shutdown; keep their launch recipe instead. */
  sessions?: Record<string, {
    title: string;
    cwd: string;
    shell: string;
    accent: "blue" | "gold" | "green" | "violet";
    initialCommand?: string;
    agentId?: string;
  }>;
  /** Saved workspace layout templates (cmux-style builds). */
  savedLayouts?: import("@/features/workspace/savedLayouts").SavedWorkspaceLayout[];
};

export function loadPersisted(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState & { boardCards?: unknown };
    const history = Array.isArray(parsed.recentHistory)
      ? parsed.recentHistory
          .filter((item) => !("view" in item) || item.view === "space")
          .map(({ workspaceId, workspaceName, cwd, at }) => ({
            workspaceId,
            workspaceName,
            cwd,
            at,
          }))
      : [];
    const agentRuns = Array.isArray(parsed.agentRuns)
      ? parsed.agentRuns
          .filter(
            (item): item is AgentRun =>
              Boolean(
                item &&
                  typeof item === "object" &&
                  typeof item.id === "string" &&
                  typeof item.agentId === "string" &&
                  typeof item.agentName === "string" &&
                  typeof item.workspaceId === "string" &&
                  typeof item.workspaceName === "string" &&
                  typeof item.cwd === "string" &&
                  typeof item.at === "number",
              ),
          )
          .map((item) => ({
            id: item.id,
            agentId: item.agentId,
            agentName: item.agentName,
            workspaceId: item.workspaceId,
            workspaceName: item.workspaceName,
            cwd: item.cwd,
            command: item.command,
            shell: item.shell,
            accent: (["blue", "gold", "green", "violet"].includes(item.accent)
              ? item.accent
              : "green") as AgentRun["accent"],
            at: item.at,
            sessionId: typeof item.sessionId === "string" ? item.sessionId : undefined,
            paneId: typeof item.paneId === "string" ? item.paneId : undefined,
          }))
          .slice(0, MAX_AGENT_RUNS)
      : [];
    return {
      ...parsed,
      recentHistory: history,
      agentRuns,
    };
  } catch {
    return null;
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPersist: PersistedState | null = null;

export function savePersisted(state: PersistedState, opts?: { flush?: boolean }) {
  pendingPersist = state;
  if (opts?.flush) {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    flushPersisted();
    return;
  }
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    flushPersisted();
  }, 120);
}

export function flushPersisted() {
  if (!pendingPersist) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pendingPersist));
  } catch {
    // ignore quota
  }
  pendingPersist = null;
}
