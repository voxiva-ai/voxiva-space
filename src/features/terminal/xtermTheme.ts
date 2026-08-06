import type { ITheme } from "@xterm/xterm";

function cssVar(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Map app theme CSS vars → xterm palette (follows current data-theme). */
export function readXtermTheme(): { theme: ITheme; allowTransparency: boolean } {
  const background = cssVar("--vs-term-bg", "#0c1119");
  const foreground = cssVar("--vs-term-fg", "#e8ecf4");
  const cursor = cssVar("--vs-term-cursor", "#c8d0dc");
  const selectionBackground = cssVar("--vs-term-selection", "#3a455555");
  const allowTransparency =
    background.startsWith("rgba") ||
    (background.startsWith("#") && (background.length === 9 || background.length === 5));

  return {
    allowTransparency,
    theme: {
      background,
      foreground,
      cursor,
      cursorAccent: background,
      selectionBackground,
      black: "#1b1f27",
      red: "#ff7b7b",
      green: "#3fd49a",
      yellow: "#efc35a",
      blue: "#5aa6ff",
      magenta: "#c792ea",
      cyan: "#7ad7ff",
      white: "#e8ecf4",
      brightBlack: "#6b7385",
      brightRed: "#ff9b9b",
      brightGreen: "#6ee7b7",
      brightYellow: "#f5d78e",
      brightBlue: "#8bbcff",
      brightMagenta: "#d7a8ff",
      brightCyan: "#a6e8ff",
      brightWhite: "#ffffff",
    },
  };
}
