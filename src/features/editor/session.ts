import type { EditorTab } from "./types";

export type EditorSessionState = {
  tabs: EditorTab[];
  activePath: string | null;
};

const memory = new Map<string, EditorSessionState>();
const STORAGE_KEY = "voxiva.editor.sessions.v1";

function readStorage(): Record<string, EditorSessionState> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, EditorSessionState>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorage(all: Record<string, EditorSessionState>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // quota / private mode
  }
}

export function loadEditorSession(workspaceId: string): EditorSessionState | null {
  if (memory.has(workspaceId)) return memory.get(workspaceId) ?? null;
  const fromDisk = readStorage()[workspaceId];
  if (fromDisk) {
    memory.set(workspaceId, fromDisk);
    return fromDisk;
  }
  return null;
}

export function saveEditorSession(workspaceId: string, state: EditorSessionState) {
  // Skip image/binary blobs — sessionStorage quota and reopen on demand.
  const slim: EditorSessionState = {
    activePath: state.activePath,
    tabs: state.tabs
      .filter((tab) => !tab.kind || tab.kind === "text")
      .map((tab) => ({ ...tab, kind: "text" as const })),
  };
  memory.set(workspaceId, slim);
  const all = readStorage();
  all[workspaceId] = slim;
  writeStorage(all);
}
