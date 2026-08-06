export type BoardColumn = "todo" | "progress" | "review" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "critical";

export type WorkspaceTask = {
  id: string;
  title: string;
  column: BoardColumn;
  priority: TaskPriority;
  due: string | null;
  createdAt: number;
};

export const BOARD_COLUMNS: BoardColumn[] = [
  "todo",
  "progress",
  "review",
  "done",
  "cancelled",
];

function key(workspaceId: string) {
  return `voxiva-space-board:${workspaceId}`;
}

export function loadBoard(workspaceId: string): WorkspaceTask[] {
  try {
    const raw = localStorage.getItem(key(workspaceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WorkspaceTask[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveBoard(workspaceId: string, tasks: WorkspaceTask[]) {
  try {
    localStorage.setItem(key(workspaceId), JSON.stringify(tasks));
  } catch {
    // ignore quota
  }
}

export function createTask(
  title: string,
  priority: TaskPriority = "medium",
  due: string | null = null,
): WorkspaceTask {
  return {
    id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    column: "todo",
    priority,
    due,
    createdAt: Date.now(),
  };
}
