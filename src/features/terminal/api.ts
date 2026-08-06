import { invoke } from "@tauri-apps/api/core";
import type { TerminalCreated } from "./types";

export function getDefaultTerminalCwd() {
  return invoke<string>("get_default_terminal_cwd");
}

export function getGitBranch(cwd: string) {
  return invoke<string | null>("get_git_branch", { cwd });
}

export function pickWorkspaceFolder() {
  return invoke<string | null>("pick_workspace_folder");
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

export function checkCommands(names: string[]) {
  return invoke<Record<string, boolean>>("check_commands", { names });
}

export function resizeTerminalSession(id: string, cols: number, rows: number) {
  return invoke("resize_terminal_session", {
    request: {
      id,
      cols,
      rows,
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

export function openUrl(url: string) {
  return invoke("open_url", { url });
}
