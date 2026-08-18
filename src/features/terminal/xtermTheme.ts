import type { ITheme } from "@xterm/xterm";
import type { ThemeId } from "@/features/theme";
import { getTheme } from "@/features/theme";

/** Map app theme → xterm palette (React `theme` id — never read stale DOM). */
export function readXtermTheme(themeId: ThemeId = "voxiva"): {
  theme: ITheme;
  allowTransparency: boolean;
} {
  const def = getTheme(themeId);
  return {
    allowTransparency: false,
    theme: {
      background: def.tokens.termBg,
      foreground: def.tokens.termFg,
      cursor: def.tokens.termCursor,
      cursorAccent: def.tokens.termBg,
      selectionBackground: def.tokens.termSelection,
      ...def.ansi,
    },
  };
}
