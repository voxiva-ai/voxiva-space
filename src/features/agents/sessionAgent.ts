import { agentBots, botCommandNames } from "@/features/agents/bots";
import type { AgentRun } from "@/lib/types";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Match agent CLI name as a token in title + initialCommand (not substring noise). */
function hayMatchesBot(hay: string, bot: (typeof agentBots)[number]): boolean {
  const lower = hay.toLowerCase();
  if (lower.includes(bot.name.toLowerCase())) return true;
  for (const name of botCommandNames(bot)) {
    const token = name.toLowerCase();
    if (!token) continue;
    if (lower === token) return true;
    const re = new RegExp(`(?:^|[\\s/"'])${escapeRegExp(token)}(?:\\s|$|[.])`, "i");
    if (re.test(hay)) return true;
  }
  return false;
}

const botsByCommandLength = [...agentBots]
  .filter((b) => b.id !== "shell")
  .sort((a, b) => {
    const alen = Math.max(0, ...botCommandNames(a).map((n) => n.length));
    const blen = Math.max(0, ...botCommandNames(b).map((n) => n.length));
    return blen - alen;
  });

/** Resolve bot id from a launch command string (`opencode --continue` → opencode). */
export function agentIdFromCommand(command?: string | null): string | null {
  const base = command?.trim().split(/\s+/)[0]?.toLowerCase();
  if (!base) return null;
  for (const bot of botsByCommandLength) {
    if (botCommandNames(bot).some((name) => name.toLowerCase() === base)) {
      return bot.id;
    }
  }
  return null;
}

function agentIdFromTitleCommand(session: { title: string; initialCommand?: string }): string {
  const hay = `${session.title} ${session.initialCommand ?? ""}`.trim();
  if (!hay) return "shell";

  for (const bot of botsByCommandLength) {
    if (hayMatchesBot(hay, bot)) return bot.id;
  }

  if (/^shell$/i.test(session.title.trim()) || /^terminal$/i.test(session.title.trim())) {
    return "shell";
  }
  return "shell";
}

/** Map a live terminal session to an agent catalog id for icons / file attach. */
export function agentIdForSession(
  session: {
    id: string;
    title: string;
    initialCommand?: string;
    agentId?: string;
  },
  agentRuns?: Pick<AgentRun, "sessionId" | "agentId">[],
): string {
  if (session.agentId && session.agentId !== "shell") return session.agentId;

  const fromRun = agentRuns?.find((run) => run.sessionId === session.id)?.agentId;
  if (fromRun && fromRun !== "shell") return fromRun;

  const fromCmd = agentIdFromCommand(session.initialCommand);
  if (fromCmd) return fromCmd;

  return agentIdFromTitleCommand(session);
}

/**
 * Detect an agent CLI starting inside an existing PTY.
 * Conservative: own-line command echo or a known product banner — never spawn a tab.
 */
export function detectAgentFromOutput(chunk: string): string | null {
  const text = chunk
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "");

  const tests: Array<[RegExp, string]> = [
    [/\bOpenCode\b/, "opencode"],
    [/(?:^|\n)\s*opencode(?:\.exe)?\s*(?:\r?\n|$)/i, "opencode"],
    [/\bClaude Code\b/, "claude"],
    [/(?:^|\n)\s*claude(?:\.exe)?\s*(?:\r?\n|$)/i, "claude"],
    [/\bOpenAI Codex\b/i, "codex"],
    [/(?:^|\n)\s*codex(?:\.exe)?\s*(?:\r?\n|$)/i, "codex"],
    [/\bGemini CLI\b/i, "gemini"],
    [/(?:^|\n)\s*gemini(?:\.exe)?\s*(?:\r?\n|$)/i, "gemini"],
    [/(?:^|\n)\s*aider(?:\.exe)?\s*(?:\r?\n|$)/i, "aider"],
    [/(?:^|\n)\s*(?:cursor-agent|cursor)\s*(?:\r?\n|$)/i, "cursor-agent"],
    [/(?:^|\n)\s*goose(?:\.exe)?\s*(?:\r?\n|$)/i, "goose"],
    [/(?:^|\n)\s*amp(?:\.exe)?\s*(?:\r?\n|$)/i, "amp"],
  ];

  for (const [re, id] of tests) {
    if (re.test(text)) return id;
  }
  return null;
}

export function isIdleShellTitle(title: string) {
  return /^(shell|terminal)$/i.test(title.trim());
}
