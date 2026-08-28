export type AttentionPrefs = {
  /** Colored ring around panes that need attention. */
  ringEnabled: boolean;
  /** CSS color for the attention ring. */
  ringColor: string;
  /** Play sound / OS toast when a task finishes or asks for input. */
  notifyEnabled: boolean;
};

export const ATTENTION_COLORS = [
  "#efc35a",
  "#5aa6ff",
  "#3fd49a",
  "#ff7b7b",
  "#a78bfa",
  "#22d3ee",
  "#fb7185",
] as const;

export const DEFAULT_ATTENTION_PREFS: AttentionPrefs = {
  ringEnabled: true,
  ringColor: "#efc35a",
  notifyEnabled: true,
};

const STORAGE_KEY = "voxiva-space-attention-v1";

let cachedAttentionPrefs: AttentionPrefs | null = null;

export function loadAttentionPrefs(): AttentionPrefs {
  if (cachedAttentionPrefs) return cachedAttentionPrefs;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cachedAttentionPrefs = { ...DEFAULT_ATTENTION_PREFS };
      return cachedAttentionPrefs;
    }
    const parsed = JSON.parse(raw) as Partial<AttentionPrefs>;
    cachedAttentionPrefs = {
      ...DEFAULT_ATTENTION_PREFS,
      ...parsed,
      ringColor:
        typeof parsed.ringColor === "string" && parsed.ringColor.trim()
          ? parsed.ringColor.trim()
          : DEFAULT_ATTENTION_PREFS.ringColor,
    };
    return cachedAttentionPrefs;
  } catch {
    cachedAttentionPrefs = { ...DEFAULT_ATTENTION_PREFS };
    return cachedAttentionPrefs;
  }
}

export function saveAttentionPrefs(prefs: AttentionPrefs) {
  cachedAttentionPrefs = prefs;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    applyAttentionPrefs(prefs);
    window.dispatchEvent(new Event("voxiva-attention-changed"));
  } catch {
    // ignore
  }
}

export function applyAttentionPrefs(prefs: AttentionPrefs = loadAttentionPrefs()) {
  const root = document.documentElement;
  root.style.setProperty("--vs-attention", prefs.ringColor);
  root.style.setProperty(
    "--vs-attention-ring",
    colorToRgba(prefs.ringColor, 0.35),
  );
  root.dataset.attentionRing = prefs.ringEnabled ? "1" : "0";
}

function colorToRgba(input: string, alpha: number) {
  const hex = input.trim();
  if (/^#([0-9a-f]{6})$/i.test(hex)) {
    const n = Number.parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `color-mix(in srgb, ${hex} ${Math.round(alpha * 100)}%, transparent)`;
}

/** Patterns that mean an agent/task finished or is waiting. */
export function stripTerminalAnsi(data: string): string {
  return data
    .replace(/\x1b\[[0-9:;?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b[@-_]/g, "");
}

/** Scan only the tail — completion cues appear at the end of a chunk stream. */
export function outputNeedsAttention(data: string): boolean {
  const plain = stripTerminalAnsi(data);
  const tail = plain.slice(-640);

  // Ignore dev-server noise (Next/Vite "ready" banners).
  if (
    /\b(Next\.js|Vite|webpack|Compiled successfully|Local:\s*http|ready in \d+|GET \/[^\s]+ \d{3})\b/i.test(
      tail,
    ) &&
    !/\b(task (complete|completed|done|finished)|awaiting|approve|\[y\/N\])\b/i.test(tail)
  ) {
    return false;
  }

  // Terminal bell / notification OSC sequences.
  if (/\x1b\](9|99|777)/.test(data)) return true;
  if (/\x07/.test(data)) return true;

  if (
    /\b(Waiting for input|Do you want to|Press enter to continue|\[y\/N\]|\[Y\/n\]|Awaiting your|needs? (your )?input|How would you like to proceed)\b/i.test(
      tail,
    )
  ) {
    return true;
  }

  // Agent finished — specific phrasing, not bare "ready"/"done" in logs.
  if (
    /\b(task (complete|completed|done|finished)|all done|finished successfully|completed successfully|execution finished)\b/i.test(
      tail,
    )
  ) {
    return true;
  }

  if (/\b(agent|session) (has )?(finished|completed|done)\b/i.test(tail)) {
    return true;
  }

  if (/\b(tests? \d+ passed|awaiting approve|done · approve)\b/i.test(tail)) {
    return true;
  }

  // OpenCode / Codex idle prompt — user must act.
  if (/\?\s*$/.test(tail.trim()) && /\b(continue|proceed|approve|allow)\b/i.test(tail)) {
    return true;
  }

  return false;
}

export function showAttentionToast(title: string, body: string) {
  const prefs = loadAttentionPrefs();
  if (!prefs.notifyEnabled) return;
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      new Notification(title, { body, silent: true });
      return;
    }
    if (Notification.permission !== "denied") {
      void Notification.requestPermission().then((perm) => {
        if (perm === "granted") new Notification(title, { body, silent: true });
      });
    }
  } catch {
    // ignore
  }
}
