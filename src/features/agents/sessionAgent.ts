import { agentBots, botCommandNames } from "@/features/agents/bots";
import type { AgentRun } from "@/lib/types";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Match agent CLI name as a token in title + initialCommand (not substring noise). */
function hayMatchesBotCommand(hay: string, bot: (typeof agentBots)[number]): boolean {
  const lower = hay.toLowerCase();
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

export function isIdleShellTitle(title: string) {
  return /^(shell|terminal)$/i.test(title.trim());
}

function agentIdFromTitle(title: string, initialCommand?: string): string {
  const trimmed = title.trim();
  if (isIdleShellTitle(trimmed)) return "shell";

  const fromCmd = agentIdFromCommand(initialCommand);
  if (fromCmd) return fromCmd;

  const bot = agentBots.find(
    (b) => b.id !== "shell" && b.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (bot) return bot.id;

  return "shell";
}

/** Map a live terminal session to an agent catalog id for tab icons / file attach. */
export function agentIdForSession(
  session: {
    id: string;
    title: string;
    initialCommand?: string;
    agentId?: string;
  },
  _agentRuns?: Pick<AgentRun, "sessionId" | "agentId">[],
): string {
  const fromCmd = agentIdFromCommand(session.initialCommand);

  // Plain Shell tab — icon stays shell until a command is launched or detected.
  if (isIdleShellTitle(session.title) && !fromCmd) return "shell";

  if (session.agentId) return session.agentId;
  if (fromCmd) return fromCmd;

  return agentIdFromTitle(session.title, session.initialCommand);
}

/** Own-line CLI echo only — no product banners (avoids false icons in plain Shell). */
export function detectAgentFromOutput(chunk: string): string | null {
  const text = chunk
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "");

  const tests: Array<[RegExp, string]> = [
    [/(?:^|\n)\s*voxiva(?:\.exe)?(?:\s|$)/i, "voxiva"],
    [/(?:^|\n)\s*opencode(?:\.exe)?(?:\s|$)/i, "opencode"],
    [/(?:^|\n)\s*claude(?:\.exe)?(?:\s|$)/i, "claude"],
    [/(?:^|\n)\s*codex(?:\.exe)?(?:\s|$)/i, "codex"],
    [/(?:^|\n)\s*gemini(?:\.exe)?(?:\s|$)/i, "gemini"],
    [/(?:^|\n)\s*aider(?:\.exe)?(?:\s|$)/i, "aider"],
    [/(?:^|\n)\s*(?:cursor-agent|cursor)(?:\.exe)?(?:\s|$)/i, "cursor-agent"],
    [/(?:^|\n)\s*goose(?:\.exe)?(?:\s|$)/i, "goose"],
    [/(?:^|\n)\s*amp(?:\.exe)?(?:\s|$)/i, "amp"],
  ];

  for (const [re, id] of tests) {
    if (re.test(text)) return id;
  }
  return null;
}

/** @deprecated internal — kept for tests / paste routing if needed */
export function hayMatchesBot(hay: string, bot: (typeof agentBots)[number]): boolean {
  if (bot.name && hay.toLowerCase() === bot.name.toLowerCase()) return true;
  return hayMatchesBotCommand(hay, bot);
}
