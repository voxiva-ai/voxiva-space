import type { MsgKey } from "@/i18n";

export type HotkeyAction =
  | "newTerminal"
  | "newTab"
  | "closeTab"
  | "closePane"
  | "closeWorkspace"
  | "reopenClosed"
  | "focusBack"
  | "focusForward"
  | "splitRight"
  | "splitDown"
  | "nextPane"
  | "prevPane"
  | "jumpAttention"
  | "newBrowserTab"
  | "focusOmnibar"
  | "maximizePane"
  | "equalizeSplits"
  | "renameWorkspace"
  | "renameTab"
  | "nextWorkspace"
  | "prevWorkspace"
  | "newSpace"
  | "spaceSettings"
  | "viewSpace"
  | "viewAgents"
  | "viewBoard"
  | "viewProjects"
  | "history"
  | "browser"
  | "settings"
  | "browserFocusMode";

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
    actions: [
      "newTerminal",
      "newTab",
      "closeTab",
      "closePane",
      "reopenClosed",
      "jumpAttention",
      "newBrowserTab",
      "focusOmnibar",
    ],
  },
  {
    id: "panes",
    labelKey: "settings.hk.group.panes",
    actions: [
      "splitRight",
      "splitDown",
      "maximizePane",
      "equalizeSplits",
      "nextPane",
      "prevPane",
      "focusBack",
      "focusForward",
      "renameTab",
    ],
  },
  {
    id: "spaces",
    labelKey: "settings.hk.group.spaces",
    actions: [
      "nextWorkspace",
      "prevWorkspace",
      "newSpace",
      "closeWorkspace",
      "renameWorkspace",
      "spaceSettings",
    ],
  },
  {
    id: "views",
    labelKey: "settings.hk.group.views",
    actions: [
      "viewSpace",
      "viewAgents",
      "viewBoard",
      "viewProjects",
      "history",
      "browser",
      "settings",
      "browserFocusMode",
    ],
  },
];

export const HOTKEY_LABELS: Record<HotkeyAction, MsgKey> = {
  newTerminal: "settings.hk.new",
  newTab: "settings.hk.newTab",
  closeTab: "settings.hk.closeTab",
  closePane: "settings.hk.closePane",
  closeWorkspace: "settings.hk.closeWorkspace",
  reopenClosed: "settings.hk.reopenClosed",
  focusBack: "settings.hk.focusBack",
  focusForward: "settings.hk.focusForward",
  splitRight: "settings.hk.split",
  splitDown: "settings.hk.splitDown",
  nextPane: "settings.hk.nextPane",
  prevPane: "settings.hk.prevPane",
  jumpAttention: "settings.hk.jumpAttention",
  newBrowserTab: "settings.hk.newBrowserTab",
  focusOmnibar: "settings.hk.focusOmnibar",
  maximizePane: "settings.hk.maximizePane",
  equalizeSplits: "settings.hk.equalizeSplits",
  renameWorkspace: "settings.hk.renameWorkspace",
  renameTab: "settings.hk.renameTab",
  nextWorkspace: "settings.hk.nextWorkspace",
  prevWorkspace: "settings.hk.prevWorkspace",
  newSpace: "settings.hk.newSpace",
  spaceSettings: "settings.hk.spaceSettings",
  viewSpace: "settings.hk.viewSpace",
  viewAgents: "settings.hk.viewAgents",
  viewBoard: "settings.hk.viewBoard",
  viewProjects: "settings.hk.viewProjects",
  history: "settings.hk.history",
  browser: "settings.hk.browser",
  settings: "settings.hk.settings",
  browserFocusMode: "settings.hk.browserFocusMode",
};

export const HOTKEY_ACTIONS = HOTKEY_GROUPS.flatMap((g) =>
  g.actions.map((id) => ({ id, labelKey: HOTKEY_LABELS[id] })),
);

/** Defaults map ⌘ chords to Ctrl on Windows (meta ≡ ctrl in matchers). */
export const DEFAULT_HOTKEYS: HotkeyMap = {
  newTerminal: { key: "t", alt: true, ctrl: false, shift: false },
  newTab: { key: "t", alt: false, ctrl: true, shift: false },
  closeTab: { key: "w", alt: false, ctrl: true, shift: false },
  closePane: { key: "w", alt: true, ctrl: false, shift: false },
  closeWorkspace: { key: "w", alt: true, ctrl: true, shift: false },
  reopenClosed: { key: "t", alt: false, ctrl: true, shift: true },
  focusBack: { key: "[", alt: false, ctrl: true, shift: false },
  focusForward: { key: "]", alt: false, ctrl: true, shift: false },
  splitRight: { key: "d", alt: false, ctrl: true, shift: false },
  splitDown: { key: "f", alt: true, ctrl: false, shift: false },
  prevPane: { key: "j", alt: true, ctrl: false, shift: false },
  nextPane: { key: "k", alt: true, ctrl: false, shift: false },
  jumpAttention: { key: "u", alt: false, ctrl: true, shift: true },
  newBrowserTab: { key: "l", alt: false, ctrl: true, shift: true },
  focusOmnibar: { key: "l", alt: false, ctrl: true, shift: false },
  maximizePane: { key: "enter", alt: false, ctrl: true, shift: true },
  equalizeSplits: { key: "=", alt: true, ctrl: true, shift: false },
  renameWorkspace: { key: "r", alt: false, ctrl: true, shift: true },
  renameTab: { key: "r", alt: false, ctrl: true, shift: false },
  nextWorkspace: { key: "1", alt: true, ctrl: false, shift: false },
  prevWorkspace: { key: "1", alt: true, ctrl: false, shift: true },
  newSpace: { key: "n", alt: false, ctrl: true, shift: false },
  spaceSettings: { key: ".", alt: true, ctrl: false, shift: false },
  viewSpace: { key: "s", alt: true, ctrl: false, shift: true },
  viewAgents: { key: "2", alt: true, ctrl: false, shift: false },
  viewBoard: { key: "3", alt: true, ctrl: false, shift: false },
  viewProjects: { key: "4", alt: true, ctrl: false, shift: false },
  history: { key: "h", alt: true, ctrl: false, shift: false },
  browser: { key: "b", alt: true, ctrl: false, shift: false },
  settings: { key: ",", alt: true, ctrl: false, shift: false },
  browserFocusMode: { key: "enter", alt: true, ctrl: true, shift: false },
};

const STORAGE_KEY = "voxiva-space-hotkeys-v5";

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
      : binding.key === "enter"
        ? "Enter"
        : binding.key === ","
          ? ","
          : binding.key === "."
            ? "."
            : binding.key === "="
              ? "="
              : binding.key === "["
                ? "["
                : binding.key === "]"
                  ? "]"
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

export function bindingsEqual(a: HotkeyBinding, b: HotkeyBinding) {
  return a.key === b.key && a.alt === b.alt && a.ctrl === b.ctrl && a.shift === b.shift;
}

let capturingHotkey = false;

export function setCapturingHotkey(on: boolean) {
  capturingHotkey = on;
}

export function isCapturingHotkey() {
  return capturingHotkey;
}

export function isModalOpen() {
  return Boolean(
    document.querySelector(".vs-modalScrim") || document.querySelector(".vs-paletteRoot"),
  );
}
