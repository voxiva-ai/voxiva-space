import type { ITheme } from "@xterm/xterm";
import { getTheme } from "@/features/theme/catalog.generated";

function selectionInactive(active: string) {
  const value = active.trim();
  if (/^#[0-9a-f]{8}$/i.test(value)) return `${value.slice(0, 7)}22`;
  if (/^#[0-9a-f]{6}$/i.test(value)) return `${value}22`;
  return value;
}

/** Build xterm palette from the active app theme (term tokens + catalog ANSI). */
export function xtermThemeForId(themeId?: string | null): {
  theme: ITheme;
  allowTransparency: boolean;
} {
  const id = themeId ?? document.documentElement.getAttribute("data-theme") ?? "voxiva";
  const def = getTheme(id);
  const { tokens, ansi } = def;

  return {
    theme: {
      background: tokens.termBg,
      foreground: tokens.termFg,
      cursor: tokens.termCursor,
      cursorAccent: tokens.termBg,
      selectionBackground: tokens.termSelection,
      selectionInactiveBackground: selectionInactive(tokens.termSelection),
      selectionForeground: undefined,
      black: ansi.black,
      red: ansi.red,
      green: ansi.green,
      yellow: ansi.yellow,
      blue: ansi.blue,
      magenta: ansi.magenta,
      cyan: ansi.cyan,
      white: ansi.white,
      brightBlack: ansi.brightBlack,
      brightRed: ansi.brightRed,
      brightGreen: ansi.brightGreen,
      brightYellow: ansi.brightYellow,
      brightBlue: ansi.brightBlue,
      brightMagenta: ansi.brightMagenta,
      brightCyan: ansi.brightCyan,
      brightWhite: ansi.brightWhite,
    },
    allowTransparency: false,
  };
}

/** @deprecated Use xtermThemeForId — kept for imports. */
export function nativeXtermTheme() {
  return xtermThemeForId();
}
