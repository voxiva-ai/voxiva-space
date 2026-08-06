/** Production Voxiva Web (animations / live site). */
export const VOXIVA_WEB_URL = "https://voxivaai.vercel.app";

/** Blank browser until the user picks a URL. */
export const DEFAULT_BROWSER_URL = "";

export const LOCAL_URL_PRESETS = [
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  VOXIVA_WEB_URL,
] as const;

export type BrowserUrlPreset = { url: string; label: string };

function looksLocalHost(host: string) {
  const h = host.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
}

/** Suggest open targets from the active project path (web app vs site). */
export function suggestBrowserUrls(cwd?: string | null): BrowserUrlPreset[] {
  const path = (cwd ?? "").replace(/\\/g, "/").toLowerCase();
  const local: BrowserUrlPreset[] = [
    { url: "http://localhost:5173", label: "localhost:5173" },
    { url: "http://127.0.0.1:3000", label: "localhost:3000" },
    { url: "http://127.0.0.1:3001", label: "localhost:3001" },
  ];

  if (/voxiva\s*web|voxiva-web|\/web\b/.test(path)) {
    return [
      { url: VOXIVA_WEB_URL, label: "Voxiva Web" },
      { url: "http://localhost:5173", label: "Dev (5173)" },
      { url: "http://127.0.0.1:3000", label: "Dev (3000)" },
    ];
  }
  if (/voxiva\s*voice|voxiva-voice/.test(path)) {
    return [
      { url: "http://localhost:1420", label: "Tauri / Voice" },
      ...local,
    ];
  }
  if (/voxiva\s*space|voxiva-space/.test(path)) {
    return [
      { url: "http://localhost:1420", label: "Space UI" },
      ...local,
    ];
  }
  if (/next|nuxt|astro|remix|svelte/.test(path)) {
    return [{ url: "http://127.0.0.1:3000", label: "App :3000" }, ...local.slice(1)];
  }
  if (/vite|react|vue|frontend|ui|web/.test(path)) {
    return [{ url: "http://localhost:5173", label: "Vite :5173" }, ...local.slice(1)];
  }

  return [...local, { url: VOXIVA_WEB_URL, label: "Voxiva Web" }];
}

/** Normalize user input into a navigable URL. Local hosts stay on http. */
export function normalizeBrowserUrl(raw: string) {
  let next = raw.trim();
  if (!next) return "";

  if (/^file:/i.test(next)) {
    try {
      return new URL(next).toString();
    } catch {
      return next;
    }
  }

  if (!/^https?:\/\//i.test(next)) {
    const bareHost = next.split("/")[0]?.split(":")[0] ?? "";
    const scheme = looksLocalHost(bareHost) ? "http" : "https";
    next = `${scheme}://${next}`;
  }

  try {
    const parsed = new URL(next);
    return parsed.toString();
  } catch {
    return next;
  }
}

export function isLocalBrowserUrl(raw: string) {
  try {
    const u = new URL(normalizeBrowserUrl(raw) || raw);
    return looksLocalHost(u.hostname);
  } catch {
    return false;
  }
}

/** Strip ANSI / OSC so URL regex can see localhost lines from npm / Vite / Next. */
export function stripAnsi(text: string) {
  return text
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")
    .replace(/\x1b[()]./g, "");
}

const LOCAL_URL_RE =
  /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{2,5})?(?:\/[^\s"'<>\\]*)?/gi;

/** Pull the newest localhost URL from terminal output (dev servers, OpenCode notes). */
export function extractLocalUrlFromOutput(chunk: string): string | null {
  const cleaned = stripAnsi(chunk);
  const matches = cleaned.match(LOCAL_URL_RE);
  if (!matches?.length) return null;
  const raw = matches[matches.length - 1];
  return normalizeBrowserUrl(raw.replace(/[),.;]+$/, "")) || null;
}

export function isWebLookingPath(path: string) {
  return /\.(html?|xhtml)$/i.test(path.replace(/\\/g, "/"));
}

/** Absolute file:// URL for local HTML preview in the embedded browser. */
export function fileUrlFromWorkspace(cwd: string, rel: string) {
  const joined = `${cwd.replace(/\\/g, "/")}/${rel.replace(/\\/g, "/")}`.replace(
    /([^:])\/{2,}/g,
    "$1/",
  );
  if (/^[A-Za-z]:\//.test(joined)) {
    return `file:///${joined}`;
  }
  const path = joined.startsWith("/") ? joined : `/${joined}`;
  return `file://${path}`;
}

export function isPreviewReloadPath(path: string) {
  return /\.(html?|xhtml|css|js|jsx|ts|tsx|mjs|cjs|vue|svelte)$/i.test(
    path.replace(/\\/g, "/"),
  );
}
