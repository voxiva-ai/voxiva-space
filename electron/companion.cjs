const http = require("node:http");
const os = require("node:os");
const { timingSafeEqual } = require("node:crypto");

function lanIp() {
  for (const group of Object.values(os.networkInterfaces())) for (const address of group || [])
    if (address.family === "IPv4" && !address.internal) return address.address;
  return null;
}

function createCompanion(emit, port = 17847, host = "0.0.0.0") {
  let server;
  let token;
  let paired = false;
  let workspaceId = null;
  let snapshot = { spaces: [], sessions: [], boards: {} };
  const tails = new Map();
  const installPageUrl = "https://voxivaai.vercel.app/products/voxiva-space/mobile";
  const actualPort = () => server?.address()?.port || port;
  const status = () => {
    const ip = lanIp();
    const pairUrl = token ? `voxiva-space://pair?t=${encodeURIComponent(token)}&h=${ip || "127.0.0.1"}&p=${actualPort()}` : null;
    return { running: Boolean(server?.listening), port: actualPort(), lanIp: ip, token: token || null, paired, pairUrl, deepLink: pairUrl, installPageUrl };
  };
  const authorized = (provided) => {
    if (typeof provided !== "string" || !token) return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  const reply = (res, code, value) => {
    res.writeHead(code, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Voxiva-Token",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(value));
  };
  const body = async (req) => {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw) > 32_768) throw new Error("Request too large");
    }
    return raw ? JSON.parse(raw) : {};
  };
  const handle = async (req, res) => {
    if (req.method === "OPTIONS") return reply(res, 204, {});
    const url = new URL(req.url, `http://127.0.0.1:${actualPort()}`);
    const { pathname } = url;
    if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) return reply(res, 200, { ok: true, message: "Install Voxiva Companion from the QR page, then open the app." });
    if (req.method === "GET" && pathname === "/api/status") {
      const { token: _token, pairUrl: _pairUrl, deepLink: _deepLink, ...publicStatus } = status();
      return reply(res, 200, publicStatus);
    }
    if (req.method === "POST" && pathname === "/api/pair") {
      const data = await body(req);
      if (!authorized(req.headers["x-voxiva-token"] || data.token)) return reply(res, 401, { error: "Invalid pairing token" });
      paired = true;
      emit("companion://paired", true);
      return reply(res, 200, { ok: true, lanIp: lanIp() || "127.0.0.1" });
    }
    if (!authorized(req.headers["x-voxiva-token"])) return reply(res, 401, { error: "Unauthorized" });
    if (req.method === "GET" && pathname === "/api/snapshot") return reply(res, 200, snapshot);
    const tailMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/tail$/);
    if (req.method === "GET" && tailMatch) {
      const tail = tails.get(decodeURIComponent(tailMatch[1]));
      const since = Math.max(0, Number(url.searchParams.get("since")) || 0);
      return reply(res, 200, { next: tail?.next || 0, chunks: tail?.chunks.filter((item) => item.seq >= since) || [] });
    }
    if (req.method === "GET" && pathname === "/api/tasks") {
      const boards = snapshot.boards || {};
      const tasks = url.searchParams.has("workspaceId") ? boards[url.searchParams.get("workspaceId")] || [] : Object.values(boards).flat();
      return reply(res, 200, { tasks });
    }
    if (req.method === "POST" && pathname === "/api/tasks") {
      const data = await body(req);
      if (typeof data.title !== "string" || !data.title.trim()) return reply(res, 400, { error: "Title required" });
      emit("companion://task", { title: data.title.trim(), priority: data.priority || "medium", workspaceId: data.workspaceId || workspaceId });
      return reply(res, 200, { ok: true });
    }
    if (req.method === "POST" && pathname === "/api/spawn") {
      const data = await body(req);
      if (typeof data.workspaceId !== "string" || !data.workspaceId.trim()) return reply(res, 400, { error: "workspaceId required" });
      emit("companion://spawn", { workspaceId: data.workspaceId.trim(), agentId: data.agentId || null, title: data.title || null, command: data.command || null });
      return reply(res, 200, { ok: true });
    }
    if (req.method === "POST" && pathname === "/api/input") {
      const data = await body(req);
      if (typeof data.sessionId !== "string" || !data.sessionId.trim() || typeof data.text !== "string" || !data.text) return reply(res, 400, { error: "sessionId and text required" });
      emit("companion://input", { sessionId: data.sessionId.trim(), text: data.text });
      return reply(res, 200, { ok: true });
    }
    const renameMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
    if (req.method === "PATCH" && renameMatch) {
      const data = await body(req);
      emit("companion://rename", { sessionId: decodeURIComponent(renameMatch[1]), title: typeof data.title === "string" && data.title.trim() || "Shell" });
      return reply(res, 200, { ok: true });
    }
    return reply(res, 404, { error: "Not found" });
  };
  const stop = () => new Promise((resolve) => {
    if (!server) { token = null; paired = false; resolve(status()); return; }
    const closing = server;
    server = null;
    closing.closeAllConnections();
    closing.close(() => { token = null; paired = false; tails.clear(); resolve(status()); });
  });
  const start = async (nextToken, nextWorkspaceId) => {
    if (typeof nextToken !== "string" || nextToken.trim().length < 8) throw new Error("Pairing token too short");
    await stop();
    token = nextToken.trim();
    workspaceId = nextWorkspaceId || null;
    snapshot = { spaces: [], sessions: [], boards: {} };
    server = http.createServer((req, res) => { void handle(req, res).catch(() => reply(res, 400, { error: "Invalid request" })); });
    try {
      await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, host, resolve); });
    } catch (error) { server = null; token = null; throw error; }
    return status();
  };
  return {
    status, start, stop,
    setWorkspace: (id) => { workspaceId = id || null; },
    pushSnapshot: (value) => { if (value && typeof value === "object") snapshot = value; },
    appendOutput: (id, data) => {
      if (!server?.listening || typeof id !== "string" || !id.trim() || typeof data !== "string" || !data) return;
      const tail = tails.get(id) || { next: 0, chunks: [], bytes: 0 };
      tail.chunks.push({ seq: tail.next++, text: data });
      tail.bytes += Buffer.byteLength(data);
      while (tail.bytes > 180_000 || tail.chunks.length > 500) tail.bytes -= Buffer.byteLength(tail.chunks.shift().text);
      tails.set(id, tail);
    },
  };
}

module.exports = { createCompanion };
