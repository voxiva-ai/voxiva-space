import { isLocalHost } from "@/features/browser/url";

/** Display name + favicon for browser tabs (cmux-style). */

const BRANDS: Record<string, string> = {
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "music.youtube.com": "YouTube Music",
  "github.com": "GitHub",
  "gist.github.com": "GitHub Gist",
  "gitlab.com": "GitLab",
  "google.com": "Google",
  "mail.google.com": "Gmail",
  "docs.google.com": "Docs",
  "drive.google.com": "Drive",
  "chatgpt.com": "ChatGPT",
  "chat.openai.com": "ChatGPT",
  "claude.ai": "Claude",
  "notion.so": "Notion",
  "figma.com": "Figma",
  "twitter.com": "X",
  "x.com": "X",
  "reddit.com": "Reddit",
  "stackoverflow.com": "Stack Overflow",
  "npmjs.com": "npm",
  "vercel.com": "Vercel",
  "localhost": "localhost",
  "127.0.0.1": "localhost",
  "[::1]": "localhost",
};

function truncate(text: string, max = 28): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function parseBrowserUrl(raw: string): URL | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    return null;
  }
}

function rootHost(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return host;
}

function brandForHost(hostname: string): string | null {
  const host = rootHost(hostname);
  if (BRANDS[host]) return BRANDS[host];
  const parts = host.split(".");
  // match foo.youtube.com → youtube.com
  if (parts.length >= 3) {
    const base = parts.slice(-2).join(".");
    if (BRANDS[base]) return BRANDS[base];
  }
  return null;
}

/** Short tab title from URL (+ optional document.title). */
export function prettyBrowserLabel(url: string, pageTitle?: string | null): string {
  const parsed = parseBrowserUrl(url);
  if (!parsed) return "";

  const host = rootHost(parsed.hostname);
  const brand = brandForHost(host);
  const local = isLocalHost(host);
  const title = pageTitle?.trim() || "";

  if (local) {
    const port = parsed.port ? `:${parsed.port}` : "";
    if (title && !/^localhost/i.test(title)) return truncate(title);
    return `localhost${port}`;
  }

  // Known sites → brand name (YouTube, not the video title).
  if (brand) return brand;

  if (title) {
    const short = title.replace(/\s*[|\-–—·•].*$/, "").trim() || title;
    return truncate(short);
  }

  // github.io / vercel.app etc. — show host without TLD clutter when short
  if (host.length <= 22) return host;
  return truncate(host, 22);
}

/** Favicon URL: page link first, else public favicon service. */
export function browserFaviconUrl(url: string, pageFavicon?: string | null): string | null {
  const fromPage = pageFavicon?.trim();
  if (fromPage && /^https?:\/\//i.test(fromPage)) return fromPage;

  const parsed = parseBrowserUrl(url);
  if (!parsed?.hostname) return null;
  const host = parsed.hostname;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}
