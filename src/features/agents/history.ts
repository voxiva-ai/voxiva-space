import { agentBots } from "@/features/agents/bots";
import type { AgentRun } from "@/lib/types";

const GENERIC_TITLES = new Set(
  agentBots.flatMap((bot) => [bot.name, bot.command, ...(bot.commands ?? [])].filter(Boolean) as string[]),
);
/** Human-readable label for a history row — prefer the session/query title over bot name. */
export function runQueryLabel(
  run: AgentRun,
  sessions: Record<string, { title: string } | undefined>,
): string {
  const live = run.sessionId ? sessions[run.sessionId]?.title?.trim() : "";
  if (live && !isGenericAgentTitle(live)) return live;
  const stored = run.agentName.trim();
  if (stored && !isGenericAgentTitle(stored)) return stored;
  return run.agentName || botDisplayName(run.agentId);
}

export function isGenericAgentTitle(title: string) {
  const t = title.trim();
  if (!t) return true;
  if (/^(shell|terminal)$/i.test(t)) return true;
  for (const name of GENERIC_TITLES) {
    if (name.toLowerCase() === t.toLowerCase()) return true;
  }
  return false;
}

export function botDisplayName(agentId: string) {
  return agentBots.find((bot) => bot.id === agentId)?.name ?? agentId;
}

export function formatRelativeTime(at: number, locale: string, now = Date.now()) {
  const ru = locale.startsWith("ru");
  const diff = Math.max(0, now - at);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return ru ? "сейчас" : "now";
  const min = Math.floor(sec / 60);
  if (min < 60) return ru ? `${min} мин назад` : `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return ru ? `${hr} ч назад` : `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return ru ? `${day} д назад` : `${day}d ago`;
  const week = Math.floor(day / 7);
  if (week < 5) return ru ? `${week} нед назад` : `${week}w ago`;
  try {
    return new Date(at).toLocaleDateString(ru ? "ru-RU" : "en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(at);
  }
}

export function groupRunsByAgent(runs: AgentRun[]) {
  const order = agentBots.map((bot) => bot.id);
  const map = new Map<string, AgentRun[]>();
  for (const run of runs) {
    const id = run.agentId || "shell";
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push(run);
  }
  const ids = [...map.keys()].sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  return ids.map((agentId) => ({
    agentId,
    agentName: botDisplayName(agentId),
    runs: map.get(agentId) ?? [],
  }));
}

export function folderLabel(cwd: string) {
  const norm = cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!norm) return "—";
  const parts = norm.split("/");
  return parts[parts.length - 1] || norm;
}

export function groupRunsByFolder(runs: AgentRun[]) {
  const map = new Map<string, AgentRun[]>();
  for (const run of runs) {
    const key = run.cwd?.trim() || "—";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(run);
  }
  return [...map.entries()]
    .sort((a, b) => {
      const atA = a[1][0]?.at ?? 0;
      const atB = b[1][0]?.at ?? 0;
      return atB - atA;
    })
    .map(([cwd, folderRuns]) => ({
      folder: cwd,
      folderName: folderLabel(cwd),
      runs: folderRuns.sort((a, b) => b.at - a.at),
    }));
}
