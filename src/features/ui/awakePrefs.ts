export type AwakeMode = "off" | "on" | "agents";

const KEY = "voxiva-awake-mode";
const CHANGE = "voxiva-awake-mode-changed";

export function loadAwakeMode(): AwakeMode {
  const value = localStorage.getItem(KEY);
  return value === "on" || value === "agents" ? value : "off";
}

export function saveAwakeMode(mode: AwakeMode) {
  localStorage.setItem(KEY, mode);
  window.dispatchEvent(new Event(CHANGE));
}

export function subscribeAwakeMode(callback: (mode: AwakeMode) => void) {
  const update = () => callback(loadAwakeMode());
  window.addEventListener(CHANGE, update);
  return () => window.removeEventListener(CHANGE, update);
}
