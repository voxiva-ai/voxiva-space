const STORAGE_KEY = "voxiva-space-ui-zoom";
const ZOOM_EVENT = "voxiva-ui-zoom-change";

export const ZOOM_MIN = 0.75;
export const ZOOM_MAX = 1.5;
export const ZOOM_STEP = 0.05;
export const ZOOM_DEFAULT = 1;

function clamp(n: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(n * 100) / 100));
}

export function loadZoom() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : ZOOM_DEFAULT;
    return Number.isFinite(n) ? clamp(n) : ZOOM_DEFAULT;
  } catch {
    return ZOOM_DEFAULT;
  }
}

export function zoomPercent(level = loadZoom()) {
  return Math.round(level * 100);
}

function notifyZoom(level: number, fromUser = true) {
  window.dispatchEvent(new CustomEvent(ZOOM_EVENT, { detail: { level, fromUser } }));
}

export function applyZoom(level: number, fromUser = true) {
  const next = clamp(level);
  document.documentElement.style.setProperty("--vs-ui-zoom", String(next));
  (document.documentElement.style as CSSStyleDeclaration & { zoom?: string }).zoom = String(next);
  try {
    localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // ignore
  }
  notifyZoom(next, fromUser);
  return next;
}

export function stepZoom(delta: number) {
  return applyZoom(loadZoom() + delta);
}

export function subscribeZoom(onChange: (level: number, fromUser: boolean) => void) {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ level?: number; fromUser?: boolean }>).detail;
    const level = typeof detail?.level === "number" ? detail.level : loadZoom();
    const fromUser = detail?.fromUser !== false;
    onChange(level, fromUser);
  };
  window.addEventListener(ZOOM_EVENT, handler);
  return () => window.removeEventListener(ZOOM_EVENT, handler);
}

/** Browser-like Ctrl/Cmd + / - / 0 and Ctrl+wheel. */
export function installUiZoom() {
  applyZoom(loadZoom(), false);

  const onKey = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key;
    if (key === "=" || key === "+") {
      event.preventDefault();
      stepZoom(ZOOM_STEP);
    } else if (key === "-" || key === "_") {
      event.preventDefault();
      stepZoom(-ZOOM_STEP);
    } else if (key === "0") {
      event.preventDefault();
      applyZoom(ZOOM_DEFAULT);
    }
  };

  const onWheel = (event: WheelEvent) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    stepZoom(event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
  };

  window.addEventListener("keydown", onKey, true);
  window.addEventListener("wheel", onWheel, { passive: false, capture: true });
  return () => {
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("wheel", onWheel, true);
  };
}
