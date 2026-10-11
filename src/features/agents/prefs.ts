const KEY = "voxiva-space-agent-prefs";

type AgentPrefs = { enabled: string[]; defaultId: string };
const defaults: AgentPrefs = {
  enabled: ["shell", "voxiva", "opencode", "claude", "codex", "aider", "gemini", "cursor-agent", "amp", "goose"],
  defaultId: "auto",
};

export function loadAgentPrefs(): AgentPrefs {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!value || !Array.isArray(value.enabled)) return defaults;
    return {
      enabled: value.enabled.filter((id: unknown) => typeof id === "string"),
      defaultId: typeof value.defaultId === "string" ? value.defaultId : "auto",
    };
  } catch {
    return defaults;
  }
}

export function saveAgentPrefs(prefs: AgentPrefs) {
  localStorage.setItem(KEY, JSON.stringify(prefs));
  window.dispatchEvent(new Event("voxiva-agent-prefs-changed"));
}

export function isAgentEnabled(id: string) {
  return loadAgentPrefs().enabled.includes(id);
}
