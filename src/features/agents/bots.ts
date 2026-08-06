import type { AgentAvailability, AgentBot } from "@/lib/types";

/** Агенты / CLI — installUrl ведёт на официальный установщик. */
export const agentBots: AgentBot[] = [
  {
    id: "shell",
    name: "Shell",
    description: "Системный shell в папке проекта.",
    accent: "green",
  },
  {
    id: "opencode",
    name: "OpenCode",
    description: "Open-source агент в терминале.",
    command: "opencode",
    accent: "blue",
    installUrl: "https://opencode.ai",
  },
  {
    id: "claude",
    name: "Claude Code",
    description: "CLI Anthropic Claude Code.",
    command: "claude",
    accent: "blue",
    installUrl: "https://docs.anthropic.com/en/docs/claude-code/overview",
  },
  {
    id: "codex",
    name: "Codex",
    description: "OpenAI Codex CLI.",
    command: "codex",
    accent: "violet",
    installUrl: "https://developers.openai.com/codex/cli/",
  },
  {
    id: "aider",
    name: "Aider",
    description: "Парное программирование в терминале.",
    command: "aider",
    accent: "gold",
    installUrl: "https://aider.chat/",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    description: "Google Gemini CLI.",
    command: "gemini",
    accent: "violet",
    installUrl: "https://github.com/google-gemini/gemini-cli",
  },
  {
    id: "cursor-agent",
    name: "Cursor Agent",
    description: "Cursor agent CLI, если установлен.",
    command: "cursor-agent",
    commands: ["agent", "cursor"],
    accent: "blue",
    installUrl: "https://cursor.com/docs/cli/overview",
  },
  {
    id: "amp",
    name: "Amp",
    description: "Amp coding agent.",
    command: "amp",
    accent: "gold",
    installUrl: "https://ampcode.com/",
  },
  {
    id: "goose",
    name: "Goose",
    description: "Block Goose agent CLI.",
    command: "goose",
    accent: "green",
    installUrl: "https://block.github.io/goose/",
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
