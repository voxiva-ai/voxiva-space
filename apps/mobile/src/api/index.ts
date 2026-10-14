import type {
  BoardTask,
  PairSession,
  RemoteTask,
  Snapshot,
  SpawnOptions,
  TaskPriority,
} from "../types";

function headers(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Voxiva-Token": token,
  };
}

/** Website URL, deep link, or LAN URL from Space QR. */
export function parsePairUrl(raw: string): PairSession | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const normalized = text
      .replace(/^voxiva-space:\/\//i, "https://pair/")
      .replace(/^voxiva-companion:\/\//i, "https://pair/");
    const url = new URL(normalized);
    const token =
      url.searchParams.get("t") ||
      url.searchParams.get("token") ||
      (url.hash.startsWith("#token=") ? url.hash.slice(7) : "");
    const hostParam = url.searchParams.get("h");
    const name = url.searchParams.get("n")?.trim();
    const port = url.searchParams.get("p") || "17847";
    if (token && hostParam) {
      return { host: `http://${hostParam}:${port}`, token, pairedAt: Date.now(), ...(name ? { name } : {}) };
    }
    if (token && (url.hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname))) {
      return {
        host: `${url.protocol}//${url.host}`,
        token,
        pairedAt: Date.now(),
        ...(name ? { name } : {}),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function pair(session: PairSession) {
  const res = await fetch(`${session.host}/api/pair`, {
    method: "POST",
    headers: headers(session.token),
    body: JSON.stringify({ token: session.token }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Pair failed");
  return (await res.json()) as { ok: boolean; lanIp?: string };
}

export async function fetchSnapshot(session: PairSession) {
  const res = await fetch(`${session.host}/api/snapshot`, { headers: headers(session.token) });
  if (!res.ok) throw new Error("Snapshot failed");
  return (await res.json()) as Snapshot;
}

export async function fetchStatus(session: PairSession) {
  const res = await fetch(`${session.host}/api/status`, { headers: headers(session.token) });
  if (!res.ok) throw new Error("Status failed");
  return (await res.json()) as {
    running: boolean;
    port: number;
    lanIp?: string | null;
    paired?: boolean;
  };
}

export async function sendTask(
  session: PairSession,
  title: string,
  priority: TaskPriority = "medium",
  workspaceId?: string,
) {
  const res = await fetch(`${session.host}/api/tasks`, {
    method: "POST",
    headers: headers(session.token),
    body: JSON.stringify({
      title,
      priority,
      ...(workspaceId ? { workspaceId } : {}),
    }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Send failed");
}

export async function spawnSession(session: PairSession, opts: SpawnOptions) {
  const res = await fetch(`${session.host}/api/spawn`, {
    method: "POST",
    headers: headers(session.token),
    body: JSON.stringify({
      workspaceId: opts.workspaceId,
      ...(opts.agentId ? { agentId: opts.agentId } : {}),
      ...(opts.title ? { title: opts.title } : {}),
      ...(opts.command ? { command: opts.command } : {}),
    }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Spawn failed");
  return (await res.json()) as { ok: boolean };
}

export async function listTasks(session: PairSession, workspaceId?: string) {
  const q = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
  const res = await fetch(`${session.host}/api/tasks${q}`, { headers: headers(session.token) });
  if (!res.ok) throw new Error("List failed");
  const data = (await res.json()) as { tasks: Array<RemoteTask | BoardTask> };
  return data.tasks ?? [];
}

export async function sendInput(session: PairSession, sessionId: string, text: string) {
  const res = await fetch(`${session.host}/api/input`, {
    method: "POST",
    headers: headers(session.token),
    body: JSON.stringify({ sessionId, text }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Input failed");
}

export async function renameSession(
  session: PairSession,
  sessionId: string,
  title: string,
) {
  const res = await fetch(`${session.host}/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: headers(session.token),
    body: JSON.stringify({ title: title.trim() || "Shell" }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Rename failed");
  return (await res.json()) as { ok: boolean };
}

export type SessionTail = {
  next: number;
  chunks: Array<{ seq: number; text: string }>;
};

export async function fetchSessionTail(
  session: PairSession,
  sessionId: string,
  since = 0,
): Promise<SessionTail> {
  const res = await fetch(
    `${session.host}/api/sessions/${encodeURIComponent(sessionId)}/tail?since=${since}`,
    { headers: headers(session.token) },
  );
  if (!res.ok) throw new Error("Tail failed");
  return (await res.json()) as SessionTail;
}
