import type { MsgKey } from "@/i18n";

export type HotkeyAction =
  | "newTerminal"
  | "closePane"
  | "splitRight"
  | "splitDown"
  | "nextPane"
  | "prevPane"
  | "nextWorkspace"
  | "prevWorkspace"
  | "viewSpace"
  | "viewAgents"
  | "viewBoard"
  | "viewEditor"
  | "viewProjects"
  | "history"
  | "browser"
  | "settings"
  | "sidebar";

export type HotkeyBinding = {
  key: string;
  alt: boolean;
  ctrl: boolean;
  shift: boolean;
};

export type HotkeyMap = Record<HotkeyAction, HotkeyBinding>;

export type HotkeyGroupId = "terminals" | "panes" | "spaces" | "views";

export const HOTKEY_GROUPS: Array<{
  id: HotkeyGroupId;
  labelKey: MsgKey;
  actions: HotkeyAction[];
}> = [
  {
    id: "terminals",
    labelKey: "settings.hk.group.terminals",
    actions: ["newTerminal", "closePane"],
  },
  {
    id: "panes",
    labelKey: "settings.hk.group.panes",
    actions: ["splitRight", "splitDown", "nextPane", "prevPane"],
  },
  {
    id: "spaces",
    labelKey: "settings.hk.group.spaces",
    actions: ["nextWorkspace", "prevWorkspace"],
  },
  {
    id: "views",
    labelKey: "settings.hk.group.views",
    actions: [
      "viewSpace",
      "viewAgents",
      "viewBoard",
      "viewEditor",
      "viewProjects",
      "history",
      "browser",
      "settings",
      "sidebar",
    ],
  },
];

export const HOTKEY_LABELS: Record<HotkeyAction, MsgKey> = {
  newTerminal: "settings.hk.new",
  closePane: "settings.hk.closePane",
  splitRight: "settings.hk.split",
  splitDown: "settings.hk.splitDown",
  nextPane: "settings.hk.nextPane",
  prevPane: "settings.hk.prevPane",
  nextWorkspace: "settings.hk.nextWorkspace",
  prevWorkspace: "settings.hk.prevWorkspace",
  viewSpace: "settings.hk.viewSpace",
  viewAgents: "settings.hk.viewAgents",
  viewBoard: "settings.hk.viewBoard",
  viewEditor: "settings.hk.viewEditor",
  viewProjects: "settings.hk.viewProjects",
  history: "settings.hk.history",
  browser: "settings.hk.browser",
  settings: "settings.hk.settings",
  sidebar: "settings.hk.sidebar",
};

/** Flat list for reset / load. */
export const HOTKEY_ACTIONS = HOTKEY_GROUPS.flatMap((g) =>
  g.actions.map((id) => ({ id, labelKey: HOTKEY_LABELS[id] })),
);

export const DEFAULT_HOTKEYS: HotkeyMap = {
  newTerminal: { key: "t", alt: true, ctrl: false, shift: false },
  closePane: { key: "w", alt: true, ctrl: false, shift: false },
  splitRight: { key: "d", alt: true, ctrl: false, shift: false },
  splitDown: { key: "d", alt: true, ctrl: false, shift: true },
  nextPane: { key: "]", alt: true, ctrl: false, shift: false },
  prevPane: { key: "[", alt: true, ctrl: false, shift: false },
  nextWorkspace: { key: "tab", alt: false, ctrl: true, shift: false },
  prevWorkspace: { key: "tab", alt: false, ctrl: true, shift: true },
  viewSpace: { key: "1", alt: true, ctrl: false, shift: true },
  viewAgents: { key: "2", alt: true, ctrl: false, shift: true },
  viewBoard: { key: "3", alt: true, ctrl: false, shift: true },
  viewEditor: { key: "4", alt: true, ctrl: false, shift: true },
  viewProjects: { key: "5", alt: true, ctrl: false, shift: true },
  history: { key: "h", alt: true, ctrl: false, shift: false },
  browser: { key: "e", alt: true, ctrl: false, shift: false },
  settings: { key: ",", alt: true, ctrl: false, shift: false },
  sidebar: { key: "b", alt: false, ctrl: true, shift: false },
};

const STORAGE_KEY = "voxiva-space-hotkeys-v1";

function normalizeBinding(raw: unknown, fallback: HotkeyBinding): HotkeyBinding {
  if (!raw || typeof raw !== "object") return fallback;
  const value = raw as Partial<HotkeyBinding>;
  const key = typeof value.key === "string" && value.key ? value.key.toLowerCase() : fallback.key;
  return {
    key,
    alt: Boolean(value.alt),
    ctrl: Boolean(value.ctrl),
    shift: Boolean(value.shift),
  };
}

export function loadHotkeys(): HotkeyMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_HOTKEYS };
    const parsed = JSON.parse(raw) as Partial<Record<string, unknown>>;
    // migrate old addPanel → splitRight
    if (parsed.addPanel && !parsed.splitRight) {
      parsed.splitRight = parsed.addPanel;
    }
    const next = { ...DEFAULT_HOTKEYS };
    for (const action of Object.keys(DEFAULT_HOTKEYS) as HotkeyAction[]) {
      next[action] = normalizeBinding(parsed[action], DEFAULT_HOTKEYS[action]);
    }
    return next;
  } catch {
    return { ...DEFAULT_HOTKEYS };
  }
}

export function saveHotkeys(map: HotkeyMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function formatHotkey(binding: HotkeyBinding) {
  const parts: string[] = [];
  if (binding.ctrl) parts.push("Ctrl");
  if (binding.alt) parts.push("Alt");
  if (binding.shift) parts.push("Shift");
  const keyLabel =
    binding.key === "tab"
      ? "Tab"
      : binding.key === ","
        ? ","
        : binding.key.length === 1
          ? binding.key.toUpperCase()
          : binding.key;
  parts.push(keyLabel);
  return parts.join(" + ");
}

export function eventMatchesBinding(event: KeyboardEvent, binding: HotkeyBinding) {
  const key = event.key.toLowerCase();
  if (key !== binding.key) return false;
  if (Boolean(event.altKey) !== binding.alt) return false;
  if (Boolean(event.ctrlKey || event.metaKey) !== binding.ctrl) return false;
  if (Boolean(event.shiftKey) !== binding.shift) return false;
  return true;
}

export function bindingFromEvent(event: KeyboardEvent): HotkeyBinding | null {
  const key = event.key.toLowerCase();
  if (!key || key === "alt" || key === "control" || key === "meta" || key === "shift") return null;
  return {
    key,
    alt: event.altKey,
    ctrl: event.ctrlKey || event.metaKey,
    shift: event.shiftKey,
  };
}
