import { browserImportCookies, browserListCookieSources } from "@/features/browser/api";

const FLAG_KEY = "voxiva-space-cookies-auto-v1";
const STATUS_KEY = "voxiva-space-cookies-auto-status";

export type AutoCookieStatus = {
  at: number;
  imported: number;
  skipped: number;
  source: string;
  ok: boolean;
  message?: string;
};

/** Prefer Chrome, then Edge, then whatever the OS exposes. */
const SOURCE_ORDER = ["chrome", "edge", "brave", "chromium", "firefox"];

export function loadAutoCookieStatus(): AutoCookieStatus | null {
  try {
    const raw = localStorage.getItem(STATUS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AutoCookieStatus;
  } catch {
    return null;
  }
}

function saveStatus(status: AutoCookieStatus) {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify(status));
  } catch {
    // ignore
  }
}

export function markCookiesAutoDone() {
  try {
    localStorage.setItem(FLAG_KEY, "1");
  } catch {
    // ignore
  }
}

export function cookiesAutoPending() {
  try {
    return localStorage.getItem(FLAG_KEY) !== "1";
  } catch {
    return true;
  }
}

/**
 * cmux-style: seed the embedded browser from the system browser once,
 * without making the user fill a Settings form.
 */
export async function ensureAutoCookieImport(force = false): Promise<AutoCookieStatus | null> {
  if (!force && !cookiesAutoPending()) return loadAutoCookieStatus();

  try {
    const sources = await browserListCookieSources().catch(() => []);
    const ids = sources.map((s) => s.id);
    const from =
      SOURCE_ORDER.find((id) => ids.includes(id)) ??
      ids[0] ??
      "chrome";

    const result = await browserImportCookies(from);
    const status: AutoCookieStatus = {
      at: Date.now(),
      imported: result.imported,
      skipped: result.skipped,
      source: result.source || from,
      ok: true,
    };
    saveStatus(status);
    markCookiesAutoDone();
    return status;
  } catch (err) {
    const status: AutoCookieStatus = {
      at: Date.now(),
      imported: 0,
      skipped: 0,
      source: "",
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
    saveStatus(status);
    // Don't block forever on lock/admin errors — retry next launch unless force.
    if (!force) markCookiesAutoDone();
    return status;
  }
}
