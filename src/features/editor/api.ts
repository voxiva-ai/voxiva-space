import { invoke } from "@tauri-apps/api/core";
import type { FileEntry, TextFile } from "./types";

export type BinaryFile = {
  path: string;
  base64: string;
  mime: string;
  size: number;
};

export function listDirectory(root: string, path = "") {
  return invoke<FileEntry[]>("list_workspace_dir", {
    workspaceRoot: root,
    relativePath: path,
  });
}

export function readTextFile(root: string, path: string) {
  return invoke<TextFile>("read_text_file", {
    workspaceRoot: root,
    relativePath: path,
  });
}

export function readBinaryFile(root: string, path: string) {
  return invoke<BinaryFile>("read_binary_file", {
    workspaceRoot: root,
    relativePath: path,
  });
}

export function writeTextFile(root: string, path: string, content: string) {
  return invoke<TextFile>("write_text_file", {
    workspaceRoot: root,
    relativePath: path,
    content,
  });
}

export function createDirectory(root: string, path: string) {
  return invoke<string>("create_workspace_dir", {
    workspaceRoot: root,
    relativePath: path,
  });
}
