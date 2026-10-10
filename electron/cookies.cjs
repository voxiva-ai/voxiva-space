const sources = [
  { id: "chrome", label: "Google Chrome" },
  { id: "edge", label: "Microsoft Edge" },
  { id: "firefox", label: "Firefox" },
  { id: "brave", label: "Brave" },
  { id: "chromium", label: "Chromium" },
];

function details(cookie) {
  if (typeof cookie?.name !== "string" || !cookie.name.trim() || typeof cookie.value !== "string") return null;
  const domain = String(cookie.domain || "").trim();
  const host = domain.replace(/^\./, "");
  if (!/^[a-z0-9.-]+$/i.test(host) || host.startsWith(".") || host.endsWith(".") || host.includes("..")) return null;
  const secure = Boolean(cookie.secure);
  const expires = Number(cookie.expires);
  if (Number.isFinite(expires) && expires > 0 && expires <= Date.now() / 1000) return null;
  return {
    url: `${secure ? "https" : "http"}://${host}/`,
    name: cookie.name,
    value: cookie.value,
    domain,
    path: typeof cookie.path === "string" && cookie.path.startsWith("/") ? cookie.path : "/",
    secure,
    httpOnly: Boolean(cookie.httpOnly),
    expirationDate: Number.isFinite(expires) && expires > 0 ? expires : Math.floor(Date.now() / 1000) + 365 * 86400,
  };
}

async function importCookies(read, store, request) {
  const from = String(request?.from || "").trim().toLowerCase();
  if (!sources.some((item) => item.id === from)) throw new Error("Unknown browser cookie source");
  const domains = Array.isArray(request.domains) ? request.domains.map((item) => String(item).trim().replace(/^\./, "").toLowerCase()).filter(Boolean) : [];
  const cookies = await read("read_browser_cookies", { from, domains: domains.length ? domains : null });
  if (!cookies.length) throw new Error(`No cookies found in ${from}`);
  let imported = 0;
  let skipped = 0;
  for (const raw of cookies) {
    const cookie = details(raw);
    const host = cookie && new URL(cookie.url).hostname.toLowerCase();
    if (!cookie || domains.length && !domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) { skipped += 1; continue; }
    try { await store.cookies.set(cookie); imported += 1; } catch { skipped += 1; }
  }
  if (!imported) throw new Error(`Could not write cookies into the Space browser profile (skipped ${skipped})`);
  await store.cookies.flushStore();
  return { imported, skipped, source: from };
}

module.exports = { sources, details, importCookies };
