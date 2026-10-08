import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "_t3themes");
const out = path.join(root, "src/features/theme/catalog.generated.ts");
const api = "https://api.github.com/repos/SunkenInTime/t3-themes/contents/themes";

/** Themes from the t3themes.com community pack we ship. */
const ALLOWED = new Set([
  "apple-frost",
  "espresso",
  "fjord",
  "miami-nights",
  "midnight-harbor",
  "nier-automata",
  "one-dark-pro-night-flat",
  "paper-ember",
  "phosphor",
  "poimandres-dark-theme",
  "rose-pine-dawn",
  "sakura",
  "whirl",
]);

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent": "voxiva-space",
            Accept: "application/vnd.github+json",
          },
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            fetchJson(res.headers.location).then(resolve, reject);
            return;
          }
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
            } catch (err) {
              reject(err);
            }
          });
        },
      )
      .on("error", reject);
  });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "voxiva-space" } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchText(res.headers.location).then(resolve, reject);
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      })
      .on("error", reject);
  });
}

async function ensureThemes() {
  let listing;
  try {
    listing = await fetchJson(api);
  } catch (err) {
    if (fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith(".json"))) return;
    throw err;
  }
  const tmp = `${dir}.tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  for (const file of listing) {
    if (!file.name?.endsWith(".json") || !file.download_url) continue;
    const id = file.name.replace(/\.json$/, "");
    if (!ALLOWED.has(id)) continue;
    const body = await fetchText(file.download_url);
    fs.writeFileSync(path.join(tmp, file.name), body);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(tmp, dir);
}

function hexAlpha(hex, a) {
  const h = String(hex || "").replace("#", "");
  if (h.length === 8) return `#${h}`;
  if (h.length !== 6) return hex;
  const aa = Math.round(a * 255).toString(16).padStart(2, "0");
  return `#${h}${aa}`;
}

function solid(hex) {
  const h = String(hex || "");
  if (h.startsWith("#") && h.length >= 9) return h.slice(0, 7);
  if (h.startsWith("#") && h.length === 7) return h;
  return h || "#07090e";
}

function luminance(hex) {
  const h = solid(hex).replace("#", "");
  if (h.length !== 6) return 0;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function pickAccent(c, appearance, canvas, text) {
  const candidates = [
    c.accent,
    c.focus,
    c.update,
    c.messageAction,
    c.terminalCursor,
    appearance === "light" ? "#2563eb" : "#5aa6ff",
    text,
  ]
    .map(solid)
    .filter(Boolean);
  for (const candidate of candidates) {
    if (contrastRatio(candidate, canvas) >= 2.4) return candidate;
  }
  return appearance === "light" ? "#0f172a" : "#5aa6ff";
}

function mapColors(c, appearance) {
  const text = solid(c.text || (appearance === "light" ? "#0f172a" : "#eef2f8"));
  const canvas = solid(c.canvas || c.chrome || "#07090e");
  const accent = pickAccent(c, appearance, canvas, text);
  const raised = solid(c.surfaceRaised || c.surface || c.codeBackground || canvas);
  const surface = solid(c.surface || raised);
  const hover = solid(c.sidebarRowHover || c.toolbarControlHover || c.muted || raised);
  const borderRaw = c.border || (appearance === "light" ? "#0f172a" : "#ffffff");
  const border =
    String(borderRaw).startsWith("#") && String(borderRaw).length === 7
      ? hexAlpha(borderRaw, appearance === "light" ? 0.38 : 0.18)
      : borderRaw;
  const borderStrong =
    String(borderRaw).startsWith("#") && String(borderRaw).length === 7
      ? hexAlpha(borderRaw, appearance === "light" ? 0.58 : 0.3)
      : borderRaw;
  const muted = solid(c.textMuted || c.mutedForeground || c.sidebarMutedForeground || "#8a93a8");
  const onAccent =
    contrastRatio("#ffffff", accent) >= 2.2
      ? "#ffffff"
      : solid(c.accentForeground || canvas);
  const update = c.update ? solid(c.update) : "";
  const messageAction = c.messageAction ? solid(c.messageAction) : "";
  const accent2 = update && contrastRatio(update, canvas) >= 2.2 ? update : messageAction || accent;
  const danger = solid(c.error || "#ff7b7b");
  const okFinal = semanticGreen(c.success || c.gitModified || c.update, appearance !== "light");
  const attention = solid(c.warning || "#efc35a");
  const termBg = solid(c.terminalBackground || c.codeBackground || raised);
  const termFg = solid(c.terminalForeground || text);
  const termCursor = solid(
    contrastRatio(solid(c.terminalCursor || ""), termBg) >= 2.2
      ? c.terminalCursor
      : accent,
  );
  const termSel = c.terminalSelection || hexAlpha(accent, 0.28);
  const chrome = solid(c.toolbar || c.sidebar || raised);
  const chromeText = solid(c.toolbarForeground || c.sidebarForeground || text);
  const chromeMuted = solid(c.sidebarMutedForeground || muted);
  return {
    appearance,
    bg: canvas,
    bgRaised: raised,
    bgHover: hover,
    surface,
    border,
    borderStrong,
    text,
    muted,
    accent,
    onAccent,
    accent2,
    accentSoft: hexAlpha(accent, 0.16),
    attention,
    attentionRing: hexAlpha(attention, 0.3),
    ok: okFinal,
    danger,
    termBg,
    termFg,
    termCursor,
    termSelection: termSel,
    termChrome: chrome,
    termChromeText: chromeText,
    termChromeMuted: chromeMuted,
    preview: [canvas, surface, accent, text],
  };
}

function forceGreen(hex, dark) {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (m) {
    const r = parseInt(m[1], 16);
    const g = parseInt(m[2], 16);
    const b = parseInt(m[3], 16);
    if (g > r + 15 && g > b + 15) return hex; // already green-ish
  }
  return dark ? "#3fd49a" : "#15803d";
}

function semanticGreen(hex, dark) {
  const value = hex ? solid(hex) : "";
  return /^#[0-9a-f]{6}$/i.test(value) ? forceGreen(value, dark) : dark ? "#3fd49a" : "#15803d";
}

function ansiFrom(tokens) {
  const dark = tokens.appearance !== "light";
  return {
    black: tokens.termBg,
    red: tokens.danger,
    green: forceGreen(tokens.ok, dark),
    yellow: tokens.attention,
    blue: tokens.accent,
    magenta: tokens.accent2,
    cyan: tokens.accent2,
    white: tokens.termFg,
    brightBlack: tokens.muted,
    brightRed: tokens.danger,
    brightGreen: forceGreen(tokens.ok, dark),
    brightYellow: tokens.attention,
    brightBlue: tokens.accent,
    brightMagenta: tokens.accent2,
    brightCyan: tokens.accent2,
    brightWhite: dark ? "#ffffff" : "#020617",
  };
}

function cleanFamilyLabel(name, id) {
  const LABEL_OVERRIDES = {
    "poimandres-dark-theme": "Poimandres",
    "one-dark-pro-night-flat": "One Dark Pro",
  };
  if (LABEL_OVERRIDES[id]) return LABEL_OVERRIDES[id];
  return String(name || "")
    .replace(/\s*[·•]\s*(Light|Dark)\s*$/i, "")
    .replace(/\s*\((Light|Dark)\)\s*$/i, "")
    .replace(/\s+dark theme$/i, "")
    .trim();
}

function buildCatalog(files) {
  const entries = [];
  const voxivaTokens = {
    appearance: "dark",
    bg: "#06080d",
    bgRaised: "#0b1018",
    bgHover: "#151c28",
    surface: "#101823",
    border: "rgba(214,226,246,0.12)",
    borderStrong: "rgba(214,226,246,0.24)",
    text: "#eef4ff",
    muted: "#8f9bb0",
    accent: "#62b0ff",
    onAccent: "#04111f",
    accent2: "#6ee7d8",
    accentSoft: "rgba(98,176,255,0.16)",
    attention: "#f0c66f",
    attentionRing: "rgba(240,198,111,0.34)",
    ok: "#48d597",
    danger: "#ff747f",
    termBg: "#090d13",
    termFg: "#e9eef8",
    termCursor: "#62b0ff",
    termSelection: "#62b0ff42",
    termChrome: "#0b1018",
    termChromeText: "#eef4ff",
    termChromeMuted: "#8f9bb0",
    preview: ["#06080d", "#101823", "#62b0ff", "#eef4ff"],
  };
  entries.push({
    id: "voxiva",
    familyId: "voxiva",
    label: "Voxiva",
    official: true,
    appearance: "dark",
    tokens: voxivaTokens,
    ansi: {
      black: "#090d13",
      red: "#ff747f",
      green: "#48d597",
      yellow: "#f0c66f",
      blue: "#62b0ff",
      magenta: "#b69cff",
      cyan: "#6ee7d8",
      white: "#e9eef8",
      brightBlack: "#748094",
      brightRed: "#ff9aa2",
      brightGreen: "#75e6b5",
      brightYellow: "#f7d995",
      brightBlue: "#93caff",
      brightMagenta: "#ccbaff",
      brightCyan: "#9df3e9",
      brightWhite: "#ffffff",
    },
  });

  for (const file of files.sort()) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    if (!ALLOWED.has(raw.id)) continue;
    const familyId = raw.id;
    const familyLabel = cleanFamilyLabel(raw.name, raw.id);
    const baseAppearance = raw.appearance === "light" ? "light" : "dark";
    const baseTokens = mapColors(raw.colors, baseAppearance);
    entries.push({
      id: familyId,
      familyId,
      label: familyLabel,
      official: false,
      appearance: baseAppearance,
      tokens: baseTokens,
      ansi: ansiFrom(baseTokens),
    });
    if (raw.variants) {
      for (const [variant, colors] of Object.entries(raw.variants)) {
        const appearance = variant === "light" ? "light" : "dark";
        const tokens = mapColors(colors, appearance);
        entries.push({
          id: `${familyId}-${variant}`,
          familyId,
          label: familyLabel,
          official: false,
          appearance,
          tokens,
          ansi: ansiFrom(tokens),
        });
      }
    }
  }
  return entries;
}

const header = `/* Auto-generated from https://t3themes.com (SunkenInTime/t3-themes). Do not edit by hand.
 * Regenerate: node scripts/gen-t3-themes.mjs
 */
export type ThemeAppearance = "dark" | "light";

export type ThemeAnsi = {
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
};

export type ThemeTokens = {
  appearance: ThemeAppearance;
  bg: string;
  bgRaised: string;
  bgHover: string;
  surface: string;
  border: string;
  borderStrong: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  accent2: string;
  accentSoft: string;
  attention: string;
  attentionRing: string;
  ok: string;
  danger: string;
  termBg: string;
  termFg: string;
  termCursor: string;
  termSelection: string;
  termChrome: string;
  termChromeText: string;
  termChromeMuted: string;
  preview: [string, string, string, string];
};

export type ThemeDefinition = {
  id: string;
  familyId: string;
  label: string;
  official: boolean;
  appearance: ThemeAppearance;
  tokens: ThemeTokens;
  ansi: ThemeAnsi;
};

`;

const footer = `
export const THEME_IDS = THEME_CATALOG.map((t) => t.id);

export type ThemeId = (typeof THEME_CATALOG)[number]["id"] | "default";

export function getTheme(id: string): ThemeDefinition {
  const key = id === "default" ? "voxiva" : id;
  return THEME_CATALOG.find((t) => t.id === key) ?? THEME_CATALOG[0];
}

/** Old Space theme ids → catalog. */
const LEGACY: Record<string, string> = {
  default: "voxiva",
  glass: "voxiva",
  gruvbox: "espresso",
  cyber: "miami-nights",
  dark: "whirl",
  light: "rose-pine-dawn",
};

export function resolveThemeId(id: string | null | undefined): ThemeId {
  if (!id) return "voxiva";
  const mapped = LEGACY[id] ?? id;
  return (THEME_IDS.includes(mapped) ? mapped : "voxiva") as ThemeId;
}
`;

await ensureThemes();
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
const entries = buildCatalog(files);

// ── Emit structured catalog with section banners ───────────────
const families = new Map();
for (const entry of entries) {
  const key = entry.familyId;
  if (!families.has(key)) families.set(key, []);
  families.get(key).push(entry);
}

function emitEntry(entry) {
  return "  " + JSON.stringify(entry, null, 2).replace(/\n/g, "\n  ") + ",\n";
}

function sectionBanner(label, count) {
  if (count > 1) {
    return (
      `\n  /* ═══════════════════════════════════════════\n` +
      `   * ${label}  ·  ${count} variants\n` +
      `   * ═══════════════════════════════════════════ */\n`
    );
  }
  return `\n  /* ── ${label} ── */\n`;
}

let catalogBody = "";
for (const [familyId, famEntries] of families) {
  catalogBody += sectionBanner(famEntries[0].label, famEntries.length);
  for (const entry of famEntries) {
    catalogBody += emitEntry(entry);
  }
}

fs.writeFileSync(
  out,
  header + `export const THEME_CATALOG: ThemeDefinition[] = [\n${catalogBody}];\n` + footer,
);
console.log(`wrote ${entries.length} themes (${files.length} source packs) → ${out}`);
