const STORAGE_KEY = "voxiva-space-ui-zoom";
const MIN = 0.75;
const MAX = 1.5;
const STEP = 0.1;

function clamp(n: number) {
  return Math.min(MAX, Math.max(MIN, Math.round(n * 100) / 100));
}

export function loadZoom() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : 1;
    return Number.isFinite(n) ? clamp(n) : 1;
  } catch {
    return 1;
  }
}

export function applyZoom(level: number) {
  const next = clamp(level);
  document.documentElement.style.setProperty("--vs-ui-zoom", String(next));
  (document.documentElement.style as CSSStyleDeclaration & { zoom?: string }).zoom = String(next);
  try {
    localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // ignore
  }
  return next;
}

/** Browser-like Ctrl/Cmd + / - / 0 and Ctrl+wheel. */
export function installUiZoom() {
  applyZoom(loadZoom());

  const onKey = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key;
    if (key === "=" || key === "+") {
      event.preventDefault();
      applyZoom(loadZoom() + STEP);
    } else if (key === "-" || key === "_") {
      event.preventDefault();
      applyZoom(loadZoom() - STEP);
    } else if (key === "0") {
      event.preventDefault();
      applyZoom(1);
    }
  };

  const onWheel = (event: WheelEvent) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    applyZoom(loadZoom() + (event.deltaY < 0 ? STEP : -STEP));
  };

  window.addEventListener("keydown", onKey, true);
  window.addEventListener("wheel", onWheel, { passive: false, capture: true });
  return () => {
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("wheel", onWheel, true);
  };
}
