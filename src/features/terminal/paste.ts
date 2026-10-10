import { writeTempFile } from "./api";
import { getNativeFilePath } from "@/platform/desktop";
import { formatPathsForPty, quoteForShell } from "./drop";

/** Bracketed paste so OpenCode/TUIs treat the payload as one paste, not keystrokes. */
export function bracketedPaste(text: string) {
  return `\x1b[200~${text.replace(/\r\n?/g, "\n")}\x1b[201~`;
}

/** Forward slashes + quoting — what OpenCode / Gemini expect for `@` file refs on Windows. */
export function formatAtMentionPath(path: string) {
  const norm = path.trim().replace(/\\/g, "/");
  if (!norm) return "";
  if (/[\s"]/.test(norm)) return `@"${norm.replace(/"/g, "")}"`;
  return `@${norm}`;
}

/** Codex likes bracketed paste; many Ink TUIs (Gemini) need plain text in the prompt. */
export function wrapAgentPaste(agentId: string, payload: string) {
  const trimmed = payload.trimEnd();
  if (!trimmed) return payload;
  const isAtAttach = trimmed.split(/\s+/).some((part) => part.startsWith("@"));
  if (isAtAttach && agentId !== "codex") {
    // Path mentions must land as keystrokes, not a bracketed blob.
    return `${trimmed} `;
  }
  // Gemini / Amp prompt boxes ignore or garble bracketed paste.
  if (agentId === "gemini" || agentId === "amp" || agentId === "goose") {
    return trimmed.replace(/\r\n?/g, "\n");
  }
  return bracketedPaste(payload);
}

function extFromMime(mime: string, fallback = "png") {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/x-icon": "ico",
    "image/svg+xml": "svg",
    "application/pdf": "pdf",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/x-msvideo": "avi",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/webm": "weba",
  };
  return map[mime.toLowerCase()] || fallback;
}

function isMediaMime(mime: string) {
  return /^(image|video|audio)\//i.test(mime) || mime === "application/pdf";
}

const OFFICE_EXT =
  /\.(pdf|svg|xlsx?|docx?|pptx?|csv|tsv|json|yaml|yml|md|txt|mp3|wav|flac|aac|ogg|m4a|mp4|webm|mov|avi|mkv)$/i;

/** Any file the user might attach to an agent chat (not only images). */
export function isAttachableFile(file: File) {
  if (!file) return false;
  const mime = (file.type || "").toLowerCase();
  if (mime && mime !== "application/octet-stream") {
    if (isMediaMime(mime)) return true;
    if (/^text\//i.test(mime)) return true;
    if (/spreadsheet|document|presentation|zip|json|xml|svg/i.test(mime)) return true;
  }
  const name = file.name || "";
  return OFFICE_EXT.test(name);
}

/** Agents that accept `@path` mentions in the prompt. */
const AGENT_AT_MENTION_IDS = new Set([
  "opencode",
  "claude",
  "codex",
  "gemini",
  "cursor-agent",
  "aider",
  "goose",
  "amp",
]);

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function saveBlobToTemp(blob: Blob, preferredName?: string) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!bytes.length) return null;
  const fromName = preferredName?.split(".").pop()?.toLowerCase();
  const ext =
    fromName && /^[a-z0-9]{1,8}$/.test(fromName)
      ? fromName
      : extFromMime(blob.type || "application/octet-stream", "bin");
  try {
    return await writeTempFile(bytesToBase64(bytes), ext);
  } catch {
    if (ext !== "bin") {
      try {
        return await writeTempFile(bytesToBase64(bytes), "bin");
      } catch {
        return null;
      }
    }
    return null;
  }
}

export type ClipboardSnapshot = {
  text: string;
  /** Images / video from clipboard (legacy split). */
  imageFiles: File[];
  /** Non-image files (PDF, Excel, audio, …). */
  otherFiles: File[];
};

/** Must run synchronously inside the paste event — clipboardData dies after the turn. */
export function snapshotClipboard(event: ClipboardEvent): ClipboardSnapshot {
  const data = event.clipboardData;
  const text = data ? data.getData("text/plain") || data.getData("text") || "" : "";
  const imageFiles: File[] = [];
  const otherFiles: File[] = [];
  if (data?.items) {
    for (const item of Array.from(data.items)) {
      if (item.kind !== "file") continue;
      const file = item.getAsFile();
      if (!file) continue;
      if (
        item.type.startsWith("image/") ||
        item.type.startsWith("video/") ||
        item.type.startsWith("audio/")
      ) {
        imageFiles.push(file);
      } else {
        otherFiles.push(file);
      }
    }
  }
  if (data?.files?.length) {
    for (const file of Array.from(data.files)) {
      const seen = [...imageFiles, ...otherFiles].some(
        (f) => f.name === file.name && f.size === file.size && f.type === file.type,
      );
      if (seen) continue;
      if (
        file.type.startsWith("image/") ||
        file.type.startsWith("video/") ||
        file.type.startsWith("audio/") ||
        isMediaMime(file.type)
      ) {
        imageFiles.push(file);
      } else {
        otherFiles.push(file);
      }
    }
  }
  return { text, imageFiles, otherFiles };
}

export function formatAgentAttachment(agentId: string, paths: string[], text = "") {
  const clean = paths.map((p) => p.trim()).filter(Boolean);
  if (!clean.length) return text || null;

  let attachment = "";
  if (AGENT_AT_MENTION_IDS.has(agentId)) {
    attachment = clean.map((p) => formatAtMentionPath(p)).join(" ");
  } else {
    attachment = formatPathsForPty(clean);
  }

  if (text.trim()) return `${text.trim()}\n${attachment}`;
  return attachment;
}

/** Prefer clipboard media → temp paths; else plain text. */
export async function payloadFromClipboardSnapshot(
  snap: ClipboardSnapshot,
  opts?: { agentId?: string },
): Promise<string | null> {
  const attachCandidates = opts?.agentId
    ? [...snap.imageFiles, ...snap.otherFiles]
    : [...snap.imageFiles, ...snap.otherFiles.filter((f) => isMediaMime(f.type) || isAttachableFile(f))];

  if (attachCandidates.length) {
    const paths: string[] = [];
    for (const file of attachCandidates) {
      const path = await saveBlobToTemp(
        file,
        file.name || `clipboard.${extFromMime(file.type || "bin")}`,
      );
      if (path) paths.push(path);
    }
    if (paths.length) {
      const agentPayload = opts?.agentId
        ? formatAgentAttachment(opts.agentId, paths, snap.text)
        : null;
      if (agentPayload) return agentPayload;
      const quoted = formatPathsForPty(paths);
      return snap.text ? `${snap.text}\n${quoted}` : quoted;
    }
  }

  if (snap.text) return snap.text;

  // Fallback when paste event had no items (some WebView2 builds).
  try {
    const text = await navigator.clipboard?.readText?.();
    if (text) return text;

    if (!navigator.clipboard?.read) return null;
    const items = await navigator.clipboard.read();
    const paths: string[] = [];
    for (const item of items) {
      const mediaType = item.types.find(
        (type) =>
          type.startsWith("image/") ||
          type.startsWith("video/") ||
          type.startsWith("audio/") ||
          type === "application/pdf",
      );
      if (mediaType) {
        const blob = await item.getType(mediaType);
        const path = await saveBlobToTemp(blob, `clipboard.${extFromMime(mediaType)}`);
        if (path) paths.push(path);
      }
    }
    if (paths.length) {
      return opts?.agentId
        ? formatAgentAttachment(opts.agentId, paths)
        : formatPathsForPty(paths);
    }
    for (const item of items) {
      if (item.types.includes("text/plain")) {
        const blob = await item.getType("text/plain");
        const textAsync = await blob.text();
        if (textAsync) return textAsync;
      }
    }
  } catch {
    // Permission / unsupported.
  }

  return null;
}

export async function payloadFromFileList(
  files: FileList | File[],
  opts?: { agentId?: string },
): Promise<string | null> {
  const list = Array.from(files);
  if (!list.length) return null;
  const paths: string[] = [];
  for (const file of list) {
    const diskPath = getNativeFilePath(file);
    if (diskPath) {
      paths.push(diskPath);
      continue;
    }
    const saved = await saveBlobToTemp(file, file.name);
    if (saved) paths.push(saved);
  }
  if (!paths.length) return null;
  if (opts?.agentId) return formatAgentAttachment(opts.agentId, paths);
  return formatPathsForPty(paths);
}

export { quoteForShell };
