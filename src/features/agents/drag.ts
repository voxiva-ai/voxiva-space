export const VOXIVA_AGENT_MIME = "application/x-voxiva-agent";
const PLAIN_PREFIX = "voxiva-agent:";

export type AgentDragPayload = {
  live: boolean;
  agentId: string;
  agentName: string;
  command?: string;
  shell?: string | null;
  accent?: string;
  sessionId?: string;
  paneId?: string;
  workspaceId?: string;
  runId?: string;
};

/** WebView2 often hides custom MIME in dragover `types` — track session drag in-process. */
let agentDragActive = false;

export function beginAgentDragSession() {
  agentDragActive = true;
}

export function endAgentDragSession() {
  agentDragActive = false;
}

export function isAgentDragActive() {
  return agentDragActive;
}

export function writeAgentDrag(data: DataTransfer, payload: AgentDragPayload) {
  const json = JSON.stringify(payload);
  try {
    data.setData(VOXIVA_AGENT_MIME, json);
  } catch {
    // Some hosts reject custom MIME; text/plain is enough with the in-process flag.
  }
  data.setData("text/plain", `${PLAIN_PREFIX}${json}`);
  data.effectAllowed = "copyMove";
  beginAgentDragSession();
}

export function isAgentDrag(data: DataTransfer) {
  if (agentDragActive) return true;
  const types = Array.from(data.types ?? []);
  return types.includes(VOXIVA_AGENT_MIME);
}

export function readAgentDrag(data: DataTransfer): AgentDragPayload | null {
  let typed = "";
  try {
    typed = data.getData(VOXIVA_AGENT_MIME);
  } catch {
    typed = "";
  }
  const plain = data.getData("text/plain") || "";
  const raw = typed || (plain.startsWith(PLAIN_PREFIX) ? plain.slice(PLAIN_PREFIX.length) : "");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AgentDragPayload;
    if (!parsed || typeof parsed.agentName !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isAgentPlainPayload(text: string) {
  return text.startsWith(PLAIN_PREFIX);
}
