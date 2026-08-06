import { invoke } from "@tauri-apps/api/core";

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
  spaces: Array<{ id: string; name: string; cwd: string; color?: string }>;
  sessions: Array<{
    id: string;
    title: string;
    status: string;
    needsAttention?: boolean;
    workspaceId?: string | null;
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

export type CompanionTaskEvent = {
  title: string;
  priority: string;
  workspaceId?: string | null;
};

export type CompanionInputEvent = {
  sessionId: string;
  text: string;
};
