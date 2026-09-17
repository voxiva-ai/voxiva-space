import { agentBots, resumeCommandFor } from "@/features/agents/bots";
import { scanVaultSessions } from "@/features/vault/api";
import type { AgentAvailability, TerminalSession } from "@/lib/types";

/** Pref: auto-run agent resume CLIs when Space reopens (cmux-style). */
const AUTO_RESUME_KEY = "voxiva-space-auto-resume-agents";

export function loadAutoResumeAgents(): boolean {
  try {
    const raw = localStorage.getItem(AUTO_RESUME_KEY);
    if (raw === null) return true;
    return raw === "1" || raw === "true";
  } catch {
    return true;
  }
}

export function saveAutoResumeAgents(on: boolean) {
  try {
    localStorage.setItem(AUTO_RESUME_KEY, on ? "1" : "0");
  } catch {
    // ignore
  }
}

/**
 * Command to re-enter an agent after quit/reboot.
 * Prefer an explicit resumeCommand (often with a native session id from the vault).
 */
export function resolveRestoreCommand(
  session: Pick<TerminalSession, "agentId" | "initialCommand" | "resumeCommand">,
  availability: AgentAvailability = {},
): string | undefined {
  const explicit = session.resumeCommand?.trim();
  if (explicit) return explicit;

  const agentId = session.agentId;
  if (!agentId || agentId === "shell") {
    return session.initialCommand?.trim() || undefined;
  }

  const bot = agentBots.find((b) => b.id === agentId);
  return (
    resumeCommandFor(bot, session.initialCommand, availability)?.trim() ||
    session.initialCommand?.trim() ||
    undefined
  );
}

/** Best-effort: pick newest on-disk session for this agent+cwd and return its resume CLI. */
export async function lookupVaultResumeCommand(
  agentId: string,
  cwd: string,
): Promise<string | undefined> {
  if (!agentId || agentId === "shell" || !cwd.trim()) return undefined;
  try {
    const entries = await scanVaultSessions({
      cwdFilter: cwd,
      limit: 48,
    });
    const match = entries.find(
      (entry) => entry.agentId === agentId && Boolean(entry.resumeCommand?.trim()),
    );
    return match?.resumeCommand?.trim() || undefined;
  } catch {
    return undefined;
  }
}
