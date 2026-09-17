import { loadAttentionPrefs, showAttentionToast } from "@/features/attention/prefs";
import { playNotifySound } from "@/features/sounds/prefs";

/** Per-session: don't re-notify within this window (sound + toast). */
const SESSION_NOTIFY_COOLDOWN_MS = 18_000;

/** Output chunks: debounce attention heuristics per session. */
const OUTPUT_SCAN_DEBOUNCE_MS = 1200;

const sessionNotifyAt = new Map<string, number>();
const outputScanAt = new Map<string, number>();
const sessionAttentionReason = new Map<string, string>();
/** When attention was last raised — used by Cmd+Shift+U to jump to newest unread. */
const attentionStampAt = new Map<string, number>();

export function stampAttention(sessionId: string) {
  attentionStampAt.set(sessionId, Date.now());
}

export function attentionStamp(sessionId: string) {
  return attentionStampAt.get(sessionId) ?? 0;
}

export function attentionReason(sessionId: string) {
  return sessionAttentionReason.get(sessionId) || "";
}

export type AttentionNotifyOpts = {
  sessionId: string;
  workspaceId?: string | null;
  activeWorkspaceId?: string | null;
  /** User is looking at this session — ring only, no sound/toast. */
  isFocusedSession?: boolean;
  reason?: string;
  title?: string;
};

export function shouldScanOutputForAttention(sessionId: string): boolean {
  const now = Date.now();
  const last = outputScanAt.get(sessionId) ?? 0;
  if (now - last < OUTPUT_SCAN_DEBOUNCE_MS) return false;
  outputScanAt.set(sessionId, now);
  return true;
}

export function notifyAttention(opts: AttentionNotifyOpts) {
  const { sessionId, workspaceId, activeWorkspaceId, isFocusedSession, reason, title } = opts;
  const now = Date.now();
  const last = sessionNotifyAt.get(sessionId) ?? 0;
  const cooledDown = now - last >= SESSION_NOTIFY_COOLDOWN_MS;
  const prevReason = sessionAttentionReason.get(sessionId);
  const reasonChanged = Boolean(reason && reason !== prevReason);

  // Ring always updates; sound/toast only on cooldown OR meaningful new reason.
  if (cooledDown || reasonChanged) {
    sessionNotifyAt.set(sessionId, now);
    if (reason) sessionAttentionReason.set(sessionId, reason);
    if (!isFocusedSession) {
      playNotifySound("attention", {
        workspaceId,
        activeWorkspaceId,
        sessionId,
      });
      if (title) {
        showAttentionToast(title, reason || "Needs attention");
      }
    }
  }
}

export function notifySessionExit(opts: {
  sessionId: string;
  workspaceId?: string | null;
  activeWorkspaceId?: string | null;
  isFocusedSession?: boolean;
  title?: string;
}) {
  const { sessionId, workspaceId, activeWorkspaceId, isFocusedSession, title } = opts;
  if (isFocusedSession) return;

  const now = Date.now();
  const last = sessionNotifyAt.get(sessionId) ?? 0;
  if (now - last < SESSION_NOTIFY_COOLDOWN_MS) return;
  sessionNotifyAt.set(sessionId, now);

  playNotifySound("exit", { workspaceId, activeWorkspaceId, sessionId });
  if (title && loadAttentionPrefs().notifyEnabled) {
    showAttentionToast(title, "Session finished");
  }
}

export function clearAttentionNotifyState(sessionId: string) {
  sessionNotifyAt.delete(sessionId);
  outputScanAt.delete(sessionId);
  sessionAttentionReason.delete(sessionId);
  attentionStampAt.delete(sessionId);
}
