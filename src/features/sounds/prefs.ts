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

function tone(
  freqs: number[],
  duration = 0.35,
  gain = 0.12,
  opts?: { type?: OscillatorType; delay?: number; detune?: number },
) {
  const c = ctx();
  const now = c.currentTime + (opts?.delay ?? 0);
  const g = c.createGain();
  g.connect(c.destination);
  g.gain.setValueAtTime(0.001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + 0.018);
  g.gain.exponentialRampToValueAtTime(gain * 0.34, now + duration * 0.45);
  g.gain.exponentialRampToValueAtTime(0.001, now + duration);
  for (const f of freqs) {
    const o = c.createOscillator();
    o.type = opts?.type ?? "sine";
    o.frequency.value = f;
    if (opts?.detune) o.detune.value = opts.detune;
    o.connect(g);
    o.start(now);
    o.stop(now + duration);
  }
}

function noise(duration = 0.12, gain = 0.018, delay = 0) {
  const c = ctx();
  const now = c.currentTime + delay;
  const samples = Math.max(1, Math.floor(c.sampleRate * duration));
  const buffer = c.createBuffer(1, samples, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / samples);
  }
  const src = c.createBufferSource();
  const filter = c.createBiquadFilter();
  const g = c.createGain();
  filter.type = "highpass";
  filter.frequency.value = 1800;
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + duration);
  src.buffer = buffer;
  src.connect(filter);
  filter.connect(g);
  g.connect(c.destination);
  src.start(now);
  src.stop(now + duration);
}

function playPreset(preset: SoundPreset, customDataUrl: string | null) {
  if (preset === "custom" && customDataUrl) {
    const audio = new Audio(customDataUrl);
    audio.volume = 0.55;
    void audio.play().catch(() => undefined);
    return;
  }
  if (preset === "soft") {
    tone([659.25, 987.77], 0.24, 0.045);
    tone([1318.51], 0.18, 0.028, { delay: 0.07 });
    noise(0.08, 0.01);
    return;
  }
  if (preset === "chime") {
    tone([523.25, 783.99], 0.2, 0.05);
    tone([659.25, 1046.5], 0.24, 0.045, { delay: 0.09 });
    tone([1567.98], 0.16, 0.025, { delay: 0.16 });
    return;
  }
  // bell
  tone([880, 1760], 0.28, 0.055, { type: "triangle" });
  tone([1320], 0.18, 0.03, { delay: 0.045, detune: -8 });
  noise(0.1, 0.012);
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
