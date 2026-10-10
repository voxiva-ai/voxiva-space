import { invoke } from "@/platform/desktop";
import type { TerminalCreated } from "./types";

export function getDefaultTerminalCwd() {
  return invoke<string>("get_default_terminal_cwd");
}

export function getGitBranch(cwd: string) {
  return invoke<string | null>("get_git_branch", { cwd });
}

export function pickWorkspaceFolder(cwd?: string | null) {
  return invoke<string | null>("pick_workspace_folder", {
    startDir: cwd ?? null,
  });
}

export function createTerminalSession(request: {
  cwd: string | null;
  shell: string | null;
  title: string;
  cols: number;
  rows: number;
  initialCommand?: string | null;
}) {
  return invoke<TerminalCreated>("create_terminal_session", {
    request: {
      cwd: request.cwd,
      shell: request.shell,
      title: request.title,
      cols: request.cols,
      rows: request.rows,
      initial_command: request.initialCommand ?? null,
    },
  });
}

export function writeTerminalSession(id: string, data: string) {
  return invoke("write_terminal_session", {
    request: {
      id,
      data,
    },
  });
}

export function writeTempFile(contentsBase64: string, extension: string) {
  return invoke<string>("write_temp_file", {
    request: {
      contentsBase64,
      extension,
    },
  });
}

export function checkCommands(names: string[]) {
  return invoke<Record<string, boolean>>("check_commands", { names });
}

export function resizeTerminalSession(
  id: string,
  cols: number,
  rows: number,
  pixels?: { width: number; height: number },
) {
  return invoke("resize_terminal_session", {
    request: {
      id,
      cols,
      rows,
      pixel_width: pixels?.width,
      pixel_height: pixels?.height,
    },
  });
}

export function killTerminalSession(id: string) {
  return invoke("kill_terminal_session", {
    request: {
      id,
    },
  });
}

export function openInExplorer(path: string) {
  return invoke("open_in_explorer", {
    request: {
      path,
    },
  });
}

export function openInCode(path: string) {
  return invoke("open_in_code", {
    request: {
      path,
    },
  });
}

export type VsCodeServeWebInfo = {
  baseUrl: string;
  connectionToken: string;
  port: number;
};

/** Start or reuse the singleton `code serve-web` process. */
export function ensureVsCodeServeWeb() {
  return invoke<VsCodeServeWebInfo>("ensure_vscode_serve_web");
}

/** Absolute filesystem folder → serve-web URL with `folder` + `tkn` query. */
export function vscodeServeWebFolderUrl(folder: string) {
  return invoke<string>("vscode_serve_web_folder_url", { folder });
}

/** True for local VS Code serve-web URLs (`tkn=` / `folder=` on localhost). */
export function isVsCodeServeWebUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (host !== "127.0.0.1" && host !== "localhost" && host !== "[::1]") {
      return false;
    }
    return parsed.searchParams.has("tkn") || parsed.searchParams.has("folder");
  } catch {
    const lower = url.toLowerCase();
    const local =
      lower.includes("127.0.0.1") || lower.includes("localhost") || lower.includes("[::1]");
    return local && (lower.includes("tkn=") || lower.includes("folder="));
  }
}

export function openUrl(url: string) {
  return invoke("open_url", { url });
}
