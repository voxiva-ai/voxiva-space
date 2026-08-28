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

/** Ensure theme borders stay visible on both light and dark surfaces. */
function ensureBorderAlpha(value: string, minAlpha: number): string {
  if (!value) return value;

  if (/^#[0-9a-fA-F]{8}$/.test(value)) {
    const rgb = value.slice(0, 7);
    const alpha = parseInt(value.slice(7, 9), 16) / 255;
    if (alpha >= minAlpha) return value;
    return `${rgb}${Math.round(minAlpha * 255)
      .toString(16)
      .padStart(2, "0")}`;
  }

  const rgba = value.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i,
  );
  if (rgba) {
    const r = rgba[1];
    const g = rgba[2];
    const b = rgba[3];
    const alpha = rgba[4] === undefined ? 1 : Number(rgba[4]);
    if (alpha >= minAlpha) return value;
    return `rgba(${r}, ${g}, ${b}, ${minAlpha.toFixed(3)})`;
  }

  return value;
}

/** Apply catalog theme to the document (CSS vars + data-theme + color-scheme). */
export function applyTheme(themeId: ThemeId | string) {
  const theme = getTheme(themeId);
  const root = document.documentElement;
  root.setAttribute("data-theme", theme.id);
  root.setAttribute("data-appearance", theme.appearance);
  root.style.colorScheme = theme.appearance;

  const light = theme.appearance === "light";
  const tokens = { ...theme.tokens };
  tokens.border = ensureBorderAlpha(tokens.border, light ? 0.34 : 0.16);
  tokens.borderStrong = ensureBorderAlpha(tokens.borderStrong, light ? 0.52 : 0.28);

  for (const [key, cssVar] of VAR_MAP) {
    const value = tokens[key];
    if (typeof value === "string") root.style.setProperty(cssVar, value);
  }

  window.dispatchEvent(new CustomEvent("voxiva-theme-change", { detail: { themeId: theme.id } }));
}

const THEME_EVENT = "voxiva-theme-change";

/** Live xterm instances subscribe to re-tint when the user switches themes. */
export function subscribeTheme(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}
