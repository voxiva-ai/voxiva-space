const KEY = "voxiva-editor-minimap";
const EVENT = "voxiva-minimap-change";

export function loadMinimap(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "0") return false;
    if (raw === "1") return true;
  } catch {
    // ignore
  }
  return true;
}

export function saveMinimap(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { on } }));
}

export function subscribeMinimap(cb: (on: boolean) => void) {
  const handler = (event: Event) => {
    cb(Boolean((event as CustomEvent<{ on?: boolean }>).detail?.on));
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
