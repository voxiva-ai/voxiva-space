import type { ThemeDefinition, ThemeId } from "./catalog.generated";
import { getTheme } from "./catalog.generated";

const VAR_MAP: Array<[keyof ThemeDefinition["tokens"], string]> = [
  ["bg", "--vs-bg"],
  ["bgRaised", "--vs-bg-raised"],
  ["bgHover", "--vs-bg-hover"],
  ["surface", "--vs-surface"],
  ["border", "--vs-border"],
  ["borderStrong", "--vs-border-strong"],
  ["text", "--vs-text"],
  ["muted", "--vs-muted"],
  ["accent", "--vs-accent"],
  ["onAccent", "--vs-on-accent"],
  ["accent2", "--vs-accent-2"],
  ["accentSoft", "--vs-accent-soft"],
  ["attention", "--vs-attention"],
  ["attentionRing", "--vs-attention-ring"],
  ["ok", "--vs-ok"],
  ["danger", "--vs-danger"],
  ["termBg", "--vs-term-bg"],
  ["termFg", "--vs-term-fg"],
  ["termCursor", "--vs-term-cursor"],
  ["termSelection", "--vs-term-selection"],
  ["termChrome", "--vs-term-chrome"],
  ["termChromeText", "--vs-term-chrome-text"],
  ["termChromeMuted", "--vs-term-chrome-muted"],
];

/** Apply catalog theme to the document (CSS vars + data-theme + color-scheme). */
export function applyTheme(themeId: ThemeId | string) {
  const theme = getTheme(themeId);
  const root = document.documentElement;
  root.setAttribute("data-theme", theme.id);
  root.setAttribute("data-appearance", theme.appearance);
  root.style.colorScheme = theme.appearance;

  for (const [key, cssVar] of VAR_MAP) {
    const value = theme.tokens[key];
    if (typeof value === "string") root.style.setProperty(cssVar, value);
  }
}
