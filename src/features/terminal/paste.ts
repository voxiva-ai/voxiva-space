import { writeTempFile } from "./api";
import { formatPathsForPty, quoteForShell } from "./drop";

/** Bracketed paste so OpenCode/TUIs treat the payload as one paste, not keystrokes. */
export function bracketedPaste(text: string) {
  return `\x1b[200~${text}\x1b[201~`;
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
    "application/pdf": "pdf",
  };
  return map[mime.toLowerCase()] || fallback;
}

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
  return writeTempFile(bytesToBase64(bytes), ext);
}

export type ClipboardSnapshot = {
  text: string;
  imageFiles: File[];
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
      if (item.type.startsWith("image/")) imageFiles.push(file);
      else otherFiles.push(file);
    }
  }
  return { text, imageFiles, otherFiles };
}

/** Prefer clipboard image → temp path; else plain text. */
export async function payloadFromClipboardSnapshot(
  snap: ClipboardSnapshot,
): Promise<string | null> {
  if (snap.imageFiles[0]) {
    const file = snap.imageFiles[0];
    const path = await saveBlobToTemp(
      file,
      file.name || `clipboard.${extFromMime(file.type || "image/png")}`,
    );
    if (path) return formatPathsForPty([path]);
  }

  if (snap.otherFiles[0]) {
    const file = snap.otherFiles[0];
    const path = await saveBlobToTemp(file, file.name);
    if (path) return formatPathsForPty([path]);
  }

  if (snap.text) return snap.text;

  // Fallback when paste event had no items (some WebView2 builds).
  try {
    if (!navigator.clipboard?.read) return null;
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((type) => type.startsWith("image/"));
      if (imageType) {
        const blob = await item.getType(imageType);
        const path = await saveBlobToTemp(blob, `clipboard.${extFromMime(imageType)}`);
        if (path) return formatPathsForPty([path]);
      }
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

export async function payloadFromFileList(files: FileList | File[]): Promise<string | null> {
  const list = Array.from(files);
  if (!list.length) return null;
  const paths: string[] = [];
  for (const file of list) {
    const anyFile = file as File & { path?: string };
    if (anyFile.path) {
      paths.push(anyFile.path);
      continue;
    }
    const saved = await saveBlobToTemp(file, file.name);
    if (saved) paths.push(saved);
  }
  if (!paths.length) return null;
  return formatPathsForPty(paths);
}

export { quoteForShell };
