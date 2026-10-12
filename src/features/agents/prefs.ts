const KEY = "voxiva-space-agent-prefs";

export type AgentLaunchOverrides = Record<string, { command: string; args: string }>;
export type AgentPrefs = {
  enabled: string[];
  defaultId: string;
  permissionMode: "manual" | "yolo";
  overrides: AgentLaunchOverrides;
};

export const DEFAULT_AGENT_PREFS: AgentPrefs = {
  enabled: ["shell", "voxiva", "opencode", "claude", "codex", "aider", "gemini", "cursor-agent", "amp", "goose"],
  defaultId: "auto",
  permissionMode: "manual",
  overrides: {},
};

export function loadAgentPrefs(): AgentPrefs {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!value || !Array.isArray(value.enabled)) return { ...DEFAULT_AGENT_PREFS };
    return {
      enabled: value.enabled.filter((id: unknown) => typeof id === "string"),
      defaultId: typeof value.defaultId === "string" ? value.defaultId : "auto",
      permissionMode: value.permissionMode === "yolo" ? "yolo" : "manual",
      overrides: value.overrides && typeof value.overrides === "object"
        ? Object.fromEntries(Object.entries(value.overrides).flatMap(([id, raw]) => {
            if (!raw || typeof raw !== "object") return [];
            const override = raw as Record<string, unknown>;
            return [[id, {
              command: typeof override.command === "string" ? override.command : "",
              args: typeof override.args === "string" ? override.args : "",
            }]];
          }))
        : {},
    };
  } catch {
    return { ...DEFAULT_AGENT_PREFS };
  }
}

export function saveAgentPrefs(prefs: AgentPrefs) {
  localStorage.setItem(KEY, JSON.stringify(prefs));
  window.dispatchEvent(new Event("voxiva-agent-prefs-changed"));
}

export function isAgentEnabled(id: string) {
  return loadAgentPrefs().enabled.includes(id);
}
