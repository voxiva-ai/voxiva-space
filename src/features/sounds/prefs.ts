export type SoundPreset = "bell" | "soft" | "chime" | "custom";

export type SoundPrefs = {
  enabled: boolean;
  onAttention: boolean;
  onExit: boolean;
  preset: SoundPreset;
  customDataUrl: string | null;
  /** Only notify for the currently active workspace. */
  activeWorkspaceOnly: boolean;
  /** Workspace ids that never play sound. */
  mutedWorkspaces: string[];
};

export const DEFAULT_SOUND_PREFS: SoundPrefs = {
  enabled: true,
  onAttention: true,
  onExit: true,
  preset: "soft",
  customDataUrl: null,
  activeWorkspaceOnly: false,
  mutedWorkspaces: [],
};

const STORAGE_KEY = "voxiva-space-sounds-v1";

let cachedSoundPrefs: SoundPrefs | null = null;

export function loadSoundPrefs(): SoundPrefs {
  if (cachedSoundPrefs) return cachedSoundPrefs;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cachedSoundPrefs = { ...DEFAULT_SOUND_PREFS };
      return cachedSoundPrefs;
    }
    const parsed = JSON.parse(raw) as Partial<SoundPrefs>;
    cachedSoundPrefs = {
      ...DEFAULT_SOUND_PREFS,
      ...parsed,
      mutedWorkspaces: Array.isArray(parsed.mutedWorkspaces)
        ? parsed.mutedWorkspaces.filter((id): id is string => typeof id === "string")
        : [],
      customDataUrl:
        typeof parsed.customDataUrl === "string" ? parsed.customDataUrl : null,
    };
    return cachedSoundPrefs;
  } catch {
    cachedSoundPrefs = { ...DEFAULT_SOUND_PREFS };
    return cachedSoundPrefs;
  }
}

export function saveSoundPrefs(prefs: SoundPrefs) {
  cachedSoundPrefs = prefs;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    window.dispatchEvent(new Event("voxiva-sounds-changed"));
  } catch {
    // ignore
  }
}

let audioCtx: AudioContext | null = null;
let unlockBound = false;

function ensureAudioUnlocked() {
  if (unlockBound || typeof window === "undefined") return;
  unlockBound = true;
  const unlock = () => {
    try {
      const c = ctx();
      if (c.state === "suspended") void c.resume();
    } catch {
      // ignore
    }
  };
  window.addEventListener("pointerdown", unlock, { once: true, capture: true });
  window.addEventListener("keydown", unlock, { once: true, capture: true });
}

function ctx() {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

ensureAudioUnlocked();

function chime(freq: number, delay: number, gain: number, duration = 0.85) {
  const c = ctx();
  const now = c.currentTime + delay;
  for (const [ratio, level] of [[1, 1], [2.01, 0.32], [3.9, 0.1]] as const) {
    const oscillator = c.createOscillator();
    const envelope = c.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = freq * ratio;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.linearRampToValueAtTime(gain * level, now + 0.009);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(c.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }
}

function playPreset(preset: SoundPreset, customDataUrl: string | null) {
  if (preset === "custom" && customDataUrl) {
    const audio = new Audio(customDataUrl);
    audio.volume = 0.55;
    void audio.play().catch(() => undefined);
    return;
  }
  if (preset === "soft") {
    chime(659.25, 0, 0.038, 0.72);
    chime(987.77, 0.12, 0.025, 0.82);
    return;
  }
  if (preset === "chime") {
    chime(523.25, 0, 0.042, 0.8);
    chime(659.25, 0.12, 0.035, 0.88);
    chime(783.99, 0.25, 0.03, 0.95);
    return;
  }
  chime(587.33, 0, 0.05, 0.95);
  chime(880, 0.08, 0.028, 1.05);
}

export type SoundEvent = "attention" | "exit";

/** Global burst coalesce — multiple panes finishing at once → one chime. */
const GLOBAL_COALESCE_MS = 2800;
const sessionCoalesceMs = 16_000;

let lastGlobalPlayAt = 0;
let lastGlobalEvent: SoundEvent | null = null;
const sessionLastPlayAt = new Map<string, number>();

export function playNotifySound(
  event: SoundEvent,
  opts?: {
    workspaceId?: string | null;
    activeWorkspaceId?: string | null;
    sessionId?: string | null;
  },
) {
  const prefs = loadSoundPrefs();
  if (!prefs.enabled) return;
  if (event === "attention" && !prefs.onAttention) return;
  if (event === "exit" && !prefs.onExit) return;

  const ws = opts?.workspaceId ?? null;
  if (ws && prefs.mutedWorkspaces.includes(ws)) return;
  if (prefs.activeWorkspaceOnly) {
    if (!ws || ws !== opts?.activeWorkspaceId) return;
  }

  const now = Date.now();
  const sessionId = opts?.sessionId ?? null;

  if (sessionId) {
    const lastSession = sessionLastPlayAt.get(sessionId) ?? 0;
    if (now - lastSession < sessionCoalesceMs) return;
    sessionLastPlayAt.set(sessionId, now);
  }

  const globalGap = now - lastGlobalPlayAt;
  if (globalGap < GLOBAL_COALESCE_MS && lastGlobalEvent === event) return;
  lastGlobalPlayAt = now;
  lastGlobalEvent = event;

  try {
    playPreset(prefs.preset, prefs.customDataUrl);
  } catch {
    // ignore autoplay / audio errors
  }
}

/** Read a local audio file into a data URL (capped ~250KB). */
export function readCustomSound(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 250_000) {
      reject(new Error("File too large (max 250KB)"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Read failed"));
    };
    reader.onerror = () => reject(new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}
