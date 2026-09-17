import type { AgentAvailability, AgentBot } from "@/lib/types";

/** Agents / CLI tools detected via PATH scan. */
export const agentBots: AgentBot[] = [
  {
    id: "shell",
    name: "Shell",
    description: "Системный shell в папке проекта.",
    accent: "green",
  },
  {
    id: "voxiva",
    name: "Voxiva CLI",
    description: "Voxiva terminal agent — plans, models, ship flows.",
    command: "voxiva",
    accent: "blue",
  },
  {
    id: "opencode",
    name: "OpenCode",
    description: "Open-source агент в терминале.",
    command: "opencode",
    accent: "blue",
  },
  {
    id: "claude",
    name: "Claude Code",
    description: "CLI Anthropic Claude Code.",
    command: "claude",
    accent: "blue",
  },
  {
    id: "codex",
    name: "Codex",
    description: "OpenAI Codex CLI.",
    command: "codex",
    accent: "violet",
  },
  {
    id: "aider",
    name: "Aider",
    description: "Парное программирование в терминале.",
    command: "aider",
    accent: "gold",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    description: "Google Gemini CLI.",
    command: "gemini",
    accent: "violet",
  },
  {
    id: "cursor-agent",
    name: "Cursor Agent",
    description: "Cursor agent CLI, если установлен.",
    command: "cursor-agent",
    commands: ["agent", "cursor"],
    accent: "blue",
  },
  {
    id: "amp",
    name: "Amp",
    description: "Amp coding agent.",
    command: "amp",
    accent: "gold",
  },
  {
    id: "goose",
    name: "Goose",
    description: "Block Goose agent CLI.",
    command: "goose",
    accent: "green",
  },
];

export function botCommandNames(bot: AgentBot): string[] {
  const names = [bot.command, ...(bot.commands ?? [])].filter(
    (name): name is string => Boolean(name && name.trim()),
  );
  return [...new Set(names)];
}

export function commandKeysForBots() {
  return [...new Set(agentBots.flatMap((bot) => botCommandNames(bot)))];
}

/** Ready only when PATH scan confirmed at least one command. */
export function isBotReady(bot: AgentBot, availability: AgentAvailability, scanned: boolean) {
  const names = botCommandNames(bot);
  if (names.length === 0) return true;
  if (!scanned) return false;
  return names.some((name) => availability[name] === true);
}

export function isBotMissing(bot: AgentBot, availability: AgentAvailability, scanned: boolean) {
  const names = botCommandNames(bot);
  if (names.length === 0) return false;
  if (!scanned) return false;
  return !names.some((name) => availability[name] === true);
}

/** Prefer a command that is actually on PATH when launching. */
export function resolveBotCommand(bot: AgentBot, availability: AgentAvailability) {
  const names = botCommandNames(bot);
  return names.find((name) => availability[name] === true) ?? bot.command ?? names[0];
}

/**
 * Rebuild the launch command so the agent resumes its last session where possible.
 * Falls back to the raw command when the bot is unknown or has no resume flag.
 */
export function resumeCommandFor(
  bot: AgentBot | undefined,
  rawCommand: string | undefined,
  availability: AgentAvailability,
): string | undefined {
  if (!bot) {
    const raw = rawCommand?.trim();
    return raw || undefined;
  }
  const resolved = resolveBotCommand(bot, availability);
  const base = (resolved || rawCommand || bot.command || "").trim().split(/\s+/)[0];
  if (!base) return undefined;
  switch (bot.id) {
    case "opencode":
      return `${base} --continue`;
    case "claude":
      // Prefer --continue (latest). Specific `--resume <id>` is attached from the vault when known.
      return `${base} --continue`;
    case "codex":
      return `${base} resume --last`;
    case "gemini":
      return `${base} --resume`;
    case "aider":
      return `${base} --restore-chat-history`;
    case "goose":
      return `${base} session --resume`;
    case "cursor-agent":
      return `${base} --resume`;
    case "amp":
      return "amp threads continue";
    case "voxiva":
      return `${base} chat`;
    default:
      return resolved || rawCommand || base;
  }
}
