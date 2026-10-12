export type StatusBarPrefs = {
  usage: boolean;
  awake: boolean;
  resources: boolean;
  sessions: boolean;
  agents: boolean;
  ports: boolean;
};

export const DEFAULT_STATUS_BAR_PREFS: StatusBarPrefs = {
  usage: true,
  awake: true,
  resources: true,
  sessions: true,
  agents: true,
  ports: true,
};

const KEY = "voxiva-status-bar-prefs-v1";
const CHANGE = "voxiva-status-bar-prefs-changed";

export function loadStatusBarPrefs(): StatusBarPrefs {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<StatusBarPrefs> | null;
    return Object.fromEntries(Object.keys(DEFAULT_STATUS_BAR_PREFS).map((key) => [
      key,
      typeof value?.[key as keyof StatusBarPrefs] === "boolean"
        ? value[key as keyof StatusBarPrefs]
        : DEFAULT_STATUS_BAR_PREFS[key as keyof StatusBarPrefs],
    ])) as StatusBarPrefs;
  } catch {
    return { ...DEFAULT_STATUS_BAR_PREFS };
  }
}

export function saveStatusBarPrefs(prefs: StatusBarPrefs) {
  localStorage.setItem(KEY, JSON.stringify(prefs));
  window.dispatchEvent(new Event(CHANGE));
}

export function subscribeStatusBarPrefs(callback: (prefs: StatusBarPrefs) => void) {
  const update = () => callback(loadStatusBarPrefs());
  window.addEventListener(CHANGE, update);
  return () => window.removeEventListener(CHANGE, update);
}
