const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const sources = [
  [".claude/projects", "claude", "claude --resume", "claude-jsonl"],
  ["codex/sessions", "codex", "codex resume", "codex-jsonl"],
  [".codex/sessions", "codex", "codex resume", "codex-jsonl"],
  ["Library/Application Support/Codex/sessions", "codex", "codex resume", "codex-jsonl"],
  [".local/share/opencode/sessions", "opencode", "opencode --session", "opencode-jsonl"],
  [".config/opencode/sessions", "opencode", "opencode --session", "opencode-jsonl"],
  ["AppData/Local/opencode/sessions", "opencode", "opencode --session", "opencode-jsonl"],
  ["AppData/Roaming/opencode/sessions", "opencode", "opencode --session", "opencode-jsonl"],
];

async function titleFromJsonl(file) {
  const handle = await fs.open(file, "r");
  try {
    const buffer = Buffer.alloc(64 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    for (const line of buffer.toString("utf8", 0, bytesRead).split(/\r?\n/).slice(0, 12)) {
      let record;
      try { record = JSON.parse(line); } catch { continue; }
      const content = record?.message?.content;
      const title = (typeof content === "string" ? content : Array.isArray(content)
        ? content.find((item) => typeof item?.text === "string")?.text : null) || record?.display || record?.title;
      if (typeof title === "string" && title.trim()) return title.trim().slice(0, 120);
    }
    return null;
  } finally { await handle.close(); }
}

function pathMatch(filter, cwd) {
  const a = filter.trim().replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
  const b = cwd.trim().replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
  return !a || !b || a.startsWith(b) || b.startsWith(a);
}

async function scan(request = {}, home = os.homedir()) {
  const query = String(request?.query || "").trim().toLowerCase();
  const filter = String(request?.cwdFilter || "");
  const limit = Math.max(0, Math.min(500, Number.isFinite(request?.limit) ? Math.floor(request.limit) : 200));
  const out = [];
  let scanned = 0;
  for (const [relative, agentId, resumePrefix, source] of sources) {
    const stack = [path.join(home, relative)];
    while (stack.length && scanned < 4000) {
      const dir = stack.pop();
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (scanned >= 4000) break;
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) { stack.push(file); continue; }
        if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
        scanned += 1;
        const stem = path.basename(entry.name, ".jsonl");
        const cwd = agentId === "claude" ? path.basename(dir).replaceAll("--", "/").replaceAll("-", path.sep) : dir;
        const title = await titleFromJsonl(file).catch(() => null) || stem;
        if (query && !title.toLowerCase().includes(query) && !cwd.toLowerCase().includes(query)) continue;
        if (!pathMatch(filter, cwd)) continue;
        const stat = await fs.stat(file).catch(() => null);
        out.push({ id: `${source}:${stem}`, agentId, title, cwd, mtimeMs: stat?.mtimeMs || 0, resumeCommand: `${resumePrefix} ${stem}`, source });
      }
    }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit);
}

module.exports = { scan };
