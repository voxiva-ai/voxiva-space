export type TaskPriority = "low" | "medium" | "high" | "critical";

export type PairSession = {
  host: string;
  token: string;
  pairedAt: number;
  name?: string;
};

export type RemoteTask = {
  title: string;
  priority: TaskPriority;
  at?: number;
  workspaceId?: string | null;
};

export type BoardColumn = "todo" | "progress" | "review" | "done" | "cancelled";

export type BoardTask = {
  id: string;
  title: string;
  column: BoardColumn | string;
  priority: TaskPriority | string;
  due: string | null;
  createdAt: number;
  workspaceId?: string;
};

export type SpaceItem = {
  id: string;
  name: string;
  cwd: string;
  color?: string;
  branch?: string | null;
};

export type SessionItem = {
  id: string;
  title: string;
  status: string;
  needsAttention?: boolean;
  workspaceId?: string | null;
};

export type HistoryItem = {
  workspaceId: string;
  workspaceName: string;
  cwd: string;
  at: number;
};

export type BrowserItem = {
  workspaceId: string;
  paneId: string;
  url: string;
  title?: string;
};

export type AgentItem = {
  id: string;
  name: string;
  command?: string | null;
  ready: boolean;
};

export type Snapshot = {
  spaces: SpaceItem[];
  sessions: SessionItem[];
  boards?: Record<string, BoardTask[]>;
  history?: HistoryItem[];
  browsers?: BrowserItem[];
  agents?: AgentItem[];
};

export type SpawnOptions = {
  workspaceId: string;
  agentId?: string;
  title?: string;
  command?: string;
};
