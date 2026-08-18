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

export function isLocalHost(host: string) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    /^127(?:\.\d{1,3}){3}$/.test(h)
  );
}

/** Suggest open targets from the active project path (web app vs site). */
export function suggestBrowserUrls(_cwd?: string | null): BrowserUrlPreset[] {
  // Intentionally empty — no localhost / project chips in the browser chrome.
  // User opens URLs manually; OpenCode / terminal can still suggest live previews.
  return [];
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

  // ":5173" / "5173" shorthand → localhost
  if (/^:\d{2,5}(?:\/.*)?$/i.test(next)) {
    next = `localhost${next}`;
  } else if (/^\d{2,5}(?:\/.*)?$/i.test(next)) {
    next = `localhost:${next}`;
  }

  if (!/^https?:\/\//i.test(next)) {
    const authority = next.split("/")[0] ?? "";
    const bareHost = authority.includes("]")
      ? authority.slice(0, authority.indexOf("]") + 1)
      : (authority.split(":")[0] ?? "");
    const scheme = isLocalHost(bareHost) ? "http" : "https";
    next = `${scheme}://${next}`;
  }

  try {
    const parsed = new URL(next);
    // Force http for loopback even if user typed https://localhost
    if (isLocalHost(parsed.hostname) && parsed.protocol === "https:") {
      parsed.protocol = "http:";
    }
    return parsed.toString();
  } catch {
    return next;
  }
}

/** Chrome-like: treat as URL vs search query. */
export function looksLikeUrl(raw: string) {
  const q = raw.trim();
  if (!q) return false;
  if (/\s/.test(q)) return false;
  if (/^(https?|file):/i.test(q)) return true;
  if (/^localhost\b/i.test(q) || /^\[::1\]/.test(q) || /^127\./.test(q)) return true;
  if (/^:\d{2,5}(?:\/.*)?$/i.test(q) || /^\d{2,5}(?:\/.*)?$/i.test(q)) return true;
  // host:port or host.tld…
  if (/^[a-z0-9][a-z0-9.-]*:\d{2,5}(?:[/?#].*)?$/i.test(q)) return true;
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:[/:?#].*)?$/i.test(q)) return true;
  // IPv4
  if (/^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:[/?#].*)?$/.test(q)) return true;
  return false;
}

export function buildSearchUrl(query: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(query.trim())}`;
}

/** Resolve omnibox input: URL as-is, otherwise Google search. */
export function resolveOmniboxInput(raw: string) {
  const q = raw.trim();
  if (!q) return "";
  if (looksLikeUrl(q)) return normalizeBrowserUrl(q);
  return buildSearchUrl(q);
}

export type OmniboxSuggestion = {
  id: string;
  kind: "history" | "search" | "url" | "preset";
  label: string;
  url: string;
  hint?: string;
};

const HISTORY_KEY = "voxiva-browser-history-v1";
const HISTORY_MAX = 40;

export function loadBrowserHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
}

export function rememberBrowserUrl(url: string) {
  const next = normalizeBrowserUrl(url);
  if (!next || !/^https?:/i.test(next)) return;
  try {
    const prev = loadBrowserHistory().filter((item) => item !== next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify([next, ...prev].slice(0, HISTORY_MAX)));
  } catch {
    // ignore quota / private mode
  }
}

function prettyHost(url: string) {
  try {
    const u = new URL(url);
    return u.host + (u.pathname === "/" ? "" : u.pathname) + u.search;
  } catch {
    return url.replace(/^https?:\/\//i, "");
  }
}

/** Dropdown rows while typing in the address bar. */
export function getOmniboxSuggestions(
  draft: string,
  _cwd?: string | null,
  history = loadBrowserHistory(),
): OmniboxSuggestion[] {
  const q = draft.trim();
  const out: OmniboxSuggestion[] = [];
  const seen = new Set<string>();

  const push = (item: OmniboxSuggestion) => {
    if (!item.url || seen.has(item.url)) return;
    seen.add(item.url);
    out.push(item);
  };

  if (q) {
    if (looksLikeUrl(q)) {
      const url = normalizeBrowserUrl(q);
      push({ id: "url", kind: "url", label: prettyHost(url), url, hint: url });
    } else {
      push({
        id: "search",
        kind: "search",
        label: q,
        url: buildSearchUrl(q),
        hint: "Google",
      });
      // Soft offer: maybe they meant a .com site
      if (/^[a-z0-9][a-z0-9-]*$/i.test(q)) {
        const guess = normalizeBrowserUrl(`${q}.com`);
        push({
          id: "guess-com",
          kind: "url",
          label: prettyHost(guess),
          url: guess,
          hint: guess,
        });
      }
    }

    const needle = q.toLowerCase();
    for (const url of history) {
      if (!url.toLowerCase().includes(needle) && !prettyHost(url).toLowerCase().includes(needle)) {
        continue;
      }
      push({
        id: `hist-${url}`,
        kind: "history",
        label: prettyHost(url),
        url,
        hint: url,
      });
      if (out.length >= 8) break;
    }
  } else {
    for (const url of history.slice(0, 5)) {
      push({
        id: `hist-${url}`,
        kind: "history",
        label: prettyHost(url),
        url,
        hint: url,
      });
    }
  }

  return out.slice(0, 8);
}

/** Swap localhost ↔ 127.0.0.1 when one form fails to connect. */
export function localhostAlt(raw: string): string | null {
  try {
    const u = new URL(normalizeBrowserUrl(raw) || raw);
    if (u.hostname === "localhost" || u.hostname.endsWith(".localhost")) {
      u.hostname = "127.0.0.1";
      return u.toString();
    }
    if (u.hostname === "127.0.0.1") {
      u.hostname = "localhost";
      return u.toString();
    }
  } catch {
    // ignore
  }
  return null;
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
