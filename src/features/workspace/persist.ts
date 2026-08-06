const STORAGE_KEY = "voxiva-space-state-v1";

export type ThemeId =
  | "default"
  | "dracula"
  | "dark"
  | "gruvbox"
  | "cyber"
  | "glass"
  | "light";

export type PersistedHistoryItem = {
  workspaceId: string;
  workspaceName: string;
  cwd: string;
  at: number;
};

export type PersistedState = {
  onboarded: boolean;
  workspaces: Array<{
    id: string;
    name: string;
    cwd: string;
    branch: string | null;
    color?: string;
    layout: unknown;
    focusedPaneId: string;
  }>;
  activeWorkspaceId: string | null;
  browserUrl: string;
  preferredShell: string;
  locale: "ru" | "en";
  theme: ThemeId;
  recentHistory: PersistedHistoryItem[];
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
    return {
      ...parsed,
      recentHistory: history,
    };
  } catch {
    return null;
  }
}

export function savePersisted(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota
  }
}
