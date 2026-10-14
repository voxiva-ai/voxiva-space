import type { Device } from "./devices";
import type { Snapshot } from "../types";

export const DEMO_DEVICE: Device = {
  id: "demo",
  name: "Demo",
  host: "127.0.0.1:17847",
  token: "demo",
  pairedAt: 0,
};

export function isDemoDevice(device: Device | null | undefined) {
  return Boolean(device && device.id === "demo");
}

/** Local preview data when nothing is paired (web / empty state). */
export const DEMO_SNAPSHOT: Snapshot = {
  spaces: [
    {
      id: "demo-space-1",
      name: "voxiva-space",
      cwd: "C:/Workspaces/voxiva-space",
      branch: "main",
      color: "#5aa6ff",
    },
    {
      id: "demo-space-2",
      name: "voxiva-voice",
      cwd: "C:/Workspaces/voxiva-voice",
      branch: "feat/hud",
      color: "#3dd68c",
    },
    {
      id: "demo-space-3",
      name: "landing",
      cwd: "C:/Workspaces/voxiva-web",
      branch: "main",
      color: "#a78bfa",
    },
  ],
  sessions: [
    {
      id: "demo-sess-1",
      workspaceId: "demo-space-1",
      title: "OpenCode",
      status: "online",
      needsAttention: true,
    },
    {
      id: "demo-sess-2",
      workspaceId: "demo-space-1",
      title: "Shell",
      status: "online",
      needsAttention: false,
    },
    {
      id: "demo-sess-3",
      workspaceId: "demo-space-2",
      title: "npm run tauri",
      status: "online",
      needsAttention: false,
    },
  ],
  history: [
    {
      workspaceId: "demo-space-1",
      workspaceName: "voxiva-space",
      cwd: "C:/Workspaces/voxiva-space",
      at: Date.now() - 1000 * 60 * 12,
    },
    {
      workspaceId: "demo-space-2",
      workspaceName: "voxiva-voice",
      cwd: "C:/Workspaces/voxiva-voice",
      at: Date.now() - 1000 * 60 * 60 * 5,
    },
    {
      workspaceId: "demo-gone",
      workspaceName: "old-prototype",
      cwd: "C:/Workspaces/archive/old-prototype",
      at: Date.now() - 1000 * 60 * 60 * 48,
    },
  ],
  boards: {
    "demo-space-1": [
      {
        id: "t1",
        title: "Polish mobile companion chrome",
        column: "progress",
        priority: "high",
        due: null,
        createdAt: Date.now() - 10000,
      },
      {
        id: "t2",
        title: "Wire QR pairing",
        column: "done",
        priority: "medium",
        due: null,
        createdAt: Date.now() - 20000,
      },
      {
        id: "t3",
        title: "Spawn OpenCode from phone",
        column: "todo",
        priority: "medium",
        due: null,
        createdAt: Date.now() - 30000,
      },
    ],
    "demo-space-2": [
      {
        id: "t4",
        title: "Welcome live preview",
        column: "review",
        priority: "low",
        due: null,
        createdAt: Date.now() - 40000,
      },
    ],
  },
  browsers: [
    {
      paneId: "demo-browser-1",
      workspaceId: "demo-space-1",
      title: "localhost:1420",
      url: "http://localhost:1420",
    },
  ],
  agents: [
    { id: "shell", name: "Shell", ready: true, command: "" },
    { id: "opencode", name: "OpenCode", ready: true, command: "opencode" },
  ],
};
