/** MIME for workspace / absolute file paths dropped into a terminal. */
import { getNativeFilePath } from "@/platform/desktop";

export const VOXIVA_PATH_MIME = "application/x-voxiva-path";
/** MIME for editor selection / multiline text (not a path). */
export const VOXIVA_TEXT_MIME = "application/x-voxiva-text";

export function joinWorkspacePath(cwd: string, rel: string) {
  const trimmed = rel.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith("\\\\") || trimmed.startsWith("/")) {
    return trimmed;
  }
  const base = cwd.replace(/[\\/]+$/, "");
  if (!base) return trimmed;
  const sep = /\\/.test(cwd) || /^[a-zA-Z]:/.test(cwd) ? "\\" : "/";
  return `${base}${sep}${trimmed.replace(/^[\\/]+/, "").replace(/[\\/]/g, sep)}`;
}

export function quoteForShell(value: string) {
  if (!value) return value;
  if (!/[\s"]/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

export function formatPathsForPty(paths: string[]) {
  return paths
    .map((p) => p.trim())
    .filter(Boolean)
    .map(quoteForShell)
    .join(" ");
}

/** Resolve HTML5 DataTransfer into PTY payload (text or quoted paths). */
export function payloadFromDataTransfer(
  data: DataTransfer,
  opts?: { cwd?: string | null },
): string | null {
  const typedText = data.getData(VOXIVA_TEXT_MIME);
  if (typedText) return typedText;

  const typedPath = data.getData(VOXIVA_PATH_MIME);
  if (typedPath && !typedPath.includes("\n")) {
    const abs = opts?.cwd ? joinWorkspacePath(opts.cwd, typedPath) : typedPath;
    return formatPathsForPty([abs]);
  }

  const plain = data.getData("text/plain");
  if (plain) {
    if (plain.startsWith("voxiva-agent:")) return null;
    // Multiline / editor selection → paste as text.
    if (plain.includes("\n") || plain.includes("\r")) return plain;
    // Single-line path-like → quote as path (absolute if we can).
    const looksPath =
      /[\\/]/.test(plain) ||
      /^[a-zA-Z]:/.test(plain) ||
      /\.(png|jpe?g|gif|webp|bmp|ico|avif|svg|ts|tsx|js|jsx|json|md|rs|py|go|css|html)$/i.test(
        plain.trim(),
      );
    if (looksPath) {
      const abs = opts?.cwd ? joinWorkspacePath(opts.cwd, plain.trim()) : plain.trim();
      return formatPathsForPty([abs]);
    }
    return plain;
  }

  return null;
}

/** Collect absolute disk paths from an HTML5 file drop (any file type). */
export function rawPathsFromDataTransfer(
  data: DataTransfer,
  opts?: { cwd?: string | null },
): string[] {
  const out: string[] = [];
  const push = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const abs = opts?.cwd
      ? joinWorkspacePath(opts.cwd, trimmed)
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
    }
  }
  return out;
}

type OsDropTarget = {
  id: string;
  el: HTMLElement;
  onPaths: (paths: string[]) => void;
  setHighlight: (on: boolean) => void;
};

const osTargets = new Map<string, OsDropTarget>();
let osUnlisten: (() => void) | null = null;
let osBoot: Promise<void> | null = null;
let scaleFactor = 1;

export type WorkspaceOsDropRouter = {
  onOver: (clientX: number, clientY: number) => void;
  onDrop: (clientX: number, clientY: number, paths: string[]) => void;
  onLeave: () => void;
};

let workspaceRouter: WorkspaceOsDropRouter | null = null;

export function registerWorkspaceOsDropRouter(router: WorkspaceOsDropRouter | null) {
  workspaceRouter = router;
}

function targetAtPoint(clientX: number, clientY: number): OsDropTarget | null {
  const hit = document.elementFromPoint(clientX, clientY);
  if (!hit) return null;
  const shell = hit.closest("[data-term-drop]") as HTMLElement | null;
  if (!shell) return null;
  // Agent panes accept file drops anywhere (paste as @path). Plain shells too.
  const id = shell.getAttribute("data-term-drop");
  if (!id) return null;
  return osTargets.get(id) ?? null;
}

function clearHighlights(except?: string) {
  for (const [id, target] of osTargets) {
    target.setHighlight(except === id);
  }
}

async function ensureOsDropListener() {
  if (window.voxiva) return;
  if (osUnlisten || osBoot) return osBoot ?? undefined;
  osBoot = (async () => {
    try {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      try {
        scaleFactor = await getCurrentWindow().scaleFactor();
      } catch {
        scaleFactor = window.devicePixelRatio || 1;
      }
      osUnlisten = await getCurrentWebview().onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "leave") {
          clearHighlights();
          workspaceRouter?.onLeave();
          return;
        }
        const x = payload.position.x / scaleFactor;
        const y = payload.position.y / scaleFactor;
        if (payload.type === "enter" || payload.type === "over") {
          const target = targetAtPoint(x, y);
          if (target) {
            clearHighlights(target.id);
            workspaceRouter?.onLeave();
            return;
          }
          if (workspaceRouter) {
            workspaceRouter.onOver(x, y);
            return;
          }
          clearHighlights();
          return;
        }
        if (payload.type === "drop") {
          const target = targetAtPoint(x, y);
          if (target && payload.paths.length) {
            target.onPaths(payload.paths);
            clearHighlights();
            workspaceRouter?.onLeave();
            return;
          }
          if (workspaceRouter && payload.paths.length) {
            workspaceRouter.onDrop(x, y, payload.paths);
            clearHighlights();
            workspaceRouter.onLeave();
            return;
          }
          clearHighlights();
          if (target && payload.paths.length) {
            target.onPaths(payload.paths);
          }
        }
      });
    } catch {
      // Browser / non-Tauri — HTML5 DnD only.
      osUnlisten = null;
    } finally {
      osBoot = null;
    }
  })();
  return osBoot;
}

export function registerTerminalOsDropTarget(target: OsDropTarget) {
  osTargets.set(target.id, target);
  void ensureOsDropListener();
  return () => {
    osTargets.delete(target.id);
    target.setHighlight(false);
    if (osTargets.size === 0 && !workspaceRouter && osUnlisten) {
      osUnlisten();
      osUnlisten = null;
    }
  };
}

export function ensureWorkspaceOsDropListener() {
  void ensureOsDropListener();
}
