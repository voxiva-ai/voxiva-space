import { invoke } from "@/platform/desktop";

export type CompanionStatus = {
  running: boolean;
  port: number;
  lanIp: string | null;
  token: string | null;
  paired: boolean;
  /** Deep link encoded in the Settings QR. */
  pairUrl: string | null;
  /** Same deep link — opens the installed Android app. */
  deepLink: string | null;
  /** Public website page to download the Android APK. */
  installPageUrl: string | null;
};

export type CompanionSnapshot = {
  spaces: Array<{ id: string; name: string; cwd: string; color?: string; branch?: string | null }>;
  sessions: Array<{
    id: string;
    title: string;
    status: string;
    needsAttention?: boolean;
    workspaceId?: string | null;
  }>;
  boards?: Record<
    string,
    Array<{
      id: string;
      title: string;
      column: string;
      priority: string;
      due: string | null;
      createdAt: number;
    }>
  >;
  history?: Array<{
    workspaceId: string;
    workspaceName: string;
    cwd: string;
    at: number;
  }>;
  browsers?: Array<{
    workspaceId: string;
    paneId: string;
    url: string;
    title?: string;
  }>;
  agents?: Array<{
    id: string;
    name: string;
    command?: string | null;
    ready: boolean;
  }>;
};

export function companionStatus() {
  return invoke<CompanionStatus>("companion_status");
}

export function companionStart(token: string, workspaceId?: string | null) {
  return invoke<CompanionStatus>("companion_start", {
    token,
    workspaceId: workspaceId ?? null,
  });
}

export function companionStop() {
  return invoke<CompanionStatus>("companion_stop");
}

export function companionSetWorkspace(workspaceId: string | null) {
  return invoke<void>("companion_set_workspace", { workspaceId });
}

export function companionPushSnapshot(snapshot: CompanionSnapshot) {
  return invoke<void>("companion_push_snapshot", { snapshot });
}

export function companionAppendOutput(sessionId: string, data: string) {
  return invoke<void>("companion_append_output", { sessionId, data });
}

export type CompanionTaskEvent = {
  title: string;
  priority: string;
  workspaceId?: string | null;
};

export type CompanionInputEvent = {
  sessionId: string;
  text: string;
};

export type CompanionSpawnEvent = {
  workspaceId: string;
  agentId?: string | null;
  title?: string | null;
  command?: string | null;
};

export type CompanionRenameEvent = {
  sessionId: string;
  title: string;
};
