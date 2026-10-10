export type TerminalPrefs = {
  scrollSpeed: number;
  fastScrollSpeed: number;
  rightClickPaste: boolean;
  focusFollowsMouse: boolean;
  copyOnSelect: boolean;
  trimGutterOnCopy: boolean;
  allowOsc52: boolean;
  scrollbackRows: number;
  wordSeparators: string;
  setupScriptCommand: string;
  setupScriptLocation: "tab" | "vertical" | "horizontal";
};

const KEY = "voxiva-terminal-prefs-v1";
const CHANGE = "voxiva-terminal-prefs-changed";
export const DEFAULT_TERMINAL_PREFS: TerminalPrefs = {
  scrollSpeed: 1,
  fastScrollSpeed: 5,
  rightClickPaste: true,
  focusFollowsMouse: false,
  copyOnSelect: false,
  trimGutterOnCopy: true,
  allowOsc52: false,
  scrollbackRows: 10000,
  wordSeparators: " ()[]{}'\"`",
  setupScriptCommand: "",
  setupScriptLocation: "tab",
};

export function loadTerminalPrefs(): TerminalPrefs {
  try {
    const stored = localStorage.getItem(KEY);
    if (!stored) return { ...DEFAULT_TERMINAL_PREFS };
    const value = JSON.parse(stored) as Partial<TerminalPrefs>;
    return {
      ...DEFAULT_TERMINAL_PREFS,
      ...value,
      scrollSpeed: clamp(value.scrollSpeed, 0.5, 3, DEFAULT_TERMINAL_PREFS.scrollSpeed),
      fastScrollSpeed: clamp(value.fastScrollSpeed, 1, 10, DEFAULT_TERMINAL_PREFS.fastScrollSpeed),
      scrollbackRows: clamp(value.scrollbackRows, 1000, 100000, DEFAULT_TERMINAL_PREFS.scrollbackRows),
      wordSeparators: typeof value.wordSeparators === "string" ? value.wordSeparators : DEFAULT_TERMINAL_PREFS.wordSeparators,
      setupScriptCommand: typeof value.setupScriptCommand === "string" ? value.setupScriptCommand : "",
      setupScriptLocation: value.setupScriptLocation === "vertical" || value.setupScriptLocation === "horizontal" ? value.setupScriptLocation : "tab",
    };
  } catch {
    return { ...DEFAULT_TERMINAL_PREFS };
  }
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

export function saveTerminalPrefs(prefs: TerminalPrefs) {
  localStorage.setItem(KEY, JSON.stringify(prefs));
  window.dispatchEvent(new Event(CHANGE));
}

export function subscribeTerminalPrefs(callback: (prefs: TerminalPrefs) => void) {
  const update = () => callback(loadTerminalPrefs());
  window.addEventListener(CHANGE, update);
  return () => window.removeEventListener(CHANGE, update);
}

export function trimCommonIndent(text: string) {
  const lines = text.split("\n");
  const nonEmpty = lines.filter((line) => line.trim());
  const indent = nonEmpty.reduce((min, line) => Math.min(min, line.match(/^\s*/)?.[0].length ?? 0), Infinity);
  return Number.isFinite(indent) && indent > 0 ? lines.map((line) => line.slice(Math.min(indent, line.length))).join("\n") : text;
}
