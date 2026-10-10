import { formatPathsForPty, payloadFromDataTransfer, VOXIVA_PATH_MIME } from "@/features/terminal/drop";
import { bracketedPaste, payloadFromFileList, saveBlobToTemp } from "@/features/terminal/paste";
import { getNativeFilePath } from "@/platform/desktop";
import {
  isPanePreviewMime,
  isPanePreviewPath,
} from "@/features/editor/types";
import {
  isExternalFileDrag,
  resolveFileDropZone,
} from "@/features/workspace/paneDropOverlay";

export { isExternalFileDrag, isPanePreviewMime, resolveFileDropZone };

/** Image / video / audio / PDF — open in the drop target pane. */
export function isPreviewDropPath(path: string) {
  return isPanePreviewPath(path);
}

/** Absolute preview paths from an HTML5 file drop (empty if not media). */
export function previewPathsFromDataTransfer(
  data: DataTransfer,
  opts?: { cwd?: string | null },
): string[] {
  const out: string[] = [];
  const push = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || !isPreviewDropPath(trimmed)) return;
    const abs =
      opts?.cwd && !/^[a-zA-Z]:[\\/]/.test(trimmed) && !trimmed.startsWith("/")
        ? `${opts.cwd.replace(/[\\/]+$/, "")}\\${trimmed.replace(/^[\\/]+/, "")}`
        : trimmed;
    if (!out.includes(abs)) out.push(abs);
  };

  const typedPath = data.getData(VOXIVA_PATH_MIME);
  if (typedPath && !typedPath.includes("\n")) push(typedPath);

  const plain = data.getData("text/plain");
  if (plain && !plain.includes("\n") && !plain.startsWith("voxiva-agent:")) {
    push(plain.trim());
  }

  if (data.files?.length) {
    for (const file of Array.from(data.files)) {
      const path = getNativeFilePath(file);
      if (path) push(path);
      else if (isPanePreviewMime(file.type) && file.name) push(file.name);
    }
  }
  return out;
}

/** Resolve previewable paths from a drop, preferring real disk paths then temp files. */
export async function resolvePreviewPathsFromDrop(
  data: DataTransfer,
  opts?: { cwd?: string | null },
): Promise<string[]> {
  const direct = previewPathsFromDataTransfer(data, opts);
  if (direct.length) return direct;
  if (!data.files?.length) return [];
  const paths: string[] = [];
  for (const file of Array.from(data.files)) {
    const disk = getNativeFilePath(file).trim();
    if (disk && isPreviewDropPath(disk)) {
      paths.push(disk);
      continue;
    }
    if (isPanePreviewMime(file.type) || isPreviewDropPath(file.name)) {
      const temp = await saveBlobToTemp(file, file.name);
      if (temp) paths.push(temp);
    }
  }
  return paths;
}

export async function payloadFromHtml5FileDrop(
  data: DataTransfer,
  opts?: { cwd?: string | null },
): Promise<string | null> {
  const fromTransfer = payloadFromDataTransfer(data, opts);
  if (fromTransfer) return fromTransfer;
  if (data.files?.length) {
    return payloadFromFileList(data.files);
  }
  return null;
}

export function payloadFromOsPaths(paths: string[]): string | null {
  const payload = formatPathsForPty(paths);
  return payload || null;
}

export function bracketedFilePayload(payload: string) {
  return bracketedPaste(payload);
}

export function relPathFromWorkspace(cwd: string, absPath: string): string | null {
  const base = cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  const abs = absPath.replace(/\\/g, "/");
  if (abs.toLowerCase() === base.toLowerCase()) return "";
  const prefix = `${base.toLowerCase()}/`;
  if (!abs.toLowerCase().startsWith(prefix)) return null;
  return abs.slice(base.length + 1);
}
