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
  preset: "bell",
  customDataUrl: null,
  activeWorkspaceOnly: false,
  mutedWorkspaces: [],
};

const STORAGE_KEY = "voxiva-space-sounds-v1";

export function loadSoundPrefs(): SoundPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SOUND_PREFS };
    const parsed = JSON.parse(raw) as Partial<SoundPrefs>;
    return {
      ...DEFAULT_SOUND_PREFS,
      ...parsed,
      mutedWorkspaces: Array.isArray(parsed.mutedWorkspaces)
        ? parsed.mutedWorkspaces.filter((id): id is string => typeof id === "string")
        : [],
      customDataUrl:
        typeof parsed.customDataUrl === "string" ? parsed.customDataUrl : null,
    };
  } catch {
    return { ...DEFAULT_SOUND_PREFS };
  }
}

export function saveSoundPrefs(prefs: SoundPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    window.dispatchEvent(new Event("voxiva-sounds-changed"));
  } catch {
    // ignore
  }
}

let audioCtx: AudioContext | null = null;

function ctx() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function tone(freqs: number[], duration = 0.35, gain = 0.12) {
  const c = ctx();
  const now = c.currentTime;
  const g = c.createGain();
  g.connect(c.destination);
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + duration);
  for (const f of freqs) {
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    o.connect(g);
    o.start(now);
    o.stop(now + duration);
  }
}

function playPreset(preset: SoundPreset, customDataUrl: string | null) {
  if (preset === "custom" && customDataUrl) {
    const audio = new Audio(customDataUrl);
    audio.volume = 0.7;
    void audio.play().catch(() => undefined);
    return;
  }
  if (preset === "soft") {
    tone([523.25, 659.25], 0.28, 0.08);
    return;
  }
  if (preset === "chime") {
    tone([784.0], 0.18, 0.1);
    window.setTimeout(() => tone([1046.5], 0.32, 0.09), 120);
    return;
  }
  // bell
  tone([880, 1320], 0.45, 0.11);
}

export type SoundEvent = "attention" | "exit";

export function playNotifySound(
  event: SoundEvent,
  opts?: { workspaceId?: string | null; activeWorkspaceId?: string | null },
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
