const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const exec = promisify(execFile);

function parseLimits(text) {
  let latest = null;
  for (const line of text.split("\n")) {
    if (!line.includes('"rate_limits"')) continue;
    try {
      const row = JSON.parse(line);
      if (row.type !== "event_msg" || row.payload?.type !== "token_count") continue;
      const limits = row.payload.rate_limits;
      const windows = [limits?.primary, limits?.secondary].filter((w) =>
        w && Number.isFinite(w.used_percent) && w.used_percent >= 0 && w.used_percent <= 100 &&
        Number.isFinite(w.window_minutes) && w.window_minutes > 0 &&
        Number.isFinite(w.resets_at) && w.resets_at > 0,
      ).map((w) => ({ used: w.used_percent, minutes: w.window_minutes, resetsAt: w.resets_at * 1000 }));
      const at = Date.parse(row.timestamp);
      if (windows.length && Number.isFinite(at) && (!latest || at > latest.at)) latest = { at, windows };
    } catch { /* A CLI may still be writing the last line. */ }
  }
  return latest;
}

async function readLimits() {
  const root = path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "sessions");
  const dirs = async (dir) => (await fs.readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory() && /^\d+$/.test(e.name)).map((e) => e.name).sort().reverse();
  try {
    // shortcut: inspect recent local CLI logs only; add provider APIs when available.
    const files = [];
    for (const year of (await dirs(root)).slice(0, 2)) {
      for (const month of (await dirs(path.join(root, year))).slice(0, 2)) {
        for (const day of (await dirs(path.join(root, year, month))).slice(0, 3)) {
          const dir = path.join(root, year, month, day);
          for (const name of await fs.readdir(dir)) if (name.endsWith(".jsonl")) files.push(path.join(dir, name));
        }
      }
    }
    const recent = (await Promise.all(files.map(async (file) => ({ file, stat: await fs.stat(file) })))).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs).slice(0, 12);
    let latest = null;
    for (const { file } of recent) {
      const handle = await fs.open(file, "r");
      try {
        const { size } = await handle.stat();
        const start = Math.max(0, size - 1024 * 1024);
        const buffer = Buffer.alloc(Math.min(size, 1024 * 1024));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
        const text = buffer.subarray(0, bytesRead).toString("utf8");
        const result = parseLimits(start ? text.slice(text.indexOf("\n") + 1) : text);
        if (result && (!latest || result.at > latest.at)) latest = result;
      } finally { await handle.close(); }
    }
    return latest;
  } catch { return null; }
}

function parsePorts(text) {
  const ports = new Map();
  for (const line of text.split("\n")) {
    const match = line.trim().match(/^TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)$/i);
    if (!match) continue;
    const port = Number(match[2]);
    const pid = Number(match[3]);
    const host = match[1] === "0.0.0.0" ? "127.0.0.1" : match[1] === "[::]" ? "[::1]" : match[1];
    if (port > 0 && port <= 65535 && pid > 0 && !ports.has(`${port}:${pid}`)) ports.set(`${port}:${pid}`, { port, pid, host });
  }
  return [...ports.values()].sort((a, b) => a.port - b.port);
}

function formatResourceMetrics(metrics, totalBytes, freeBytes) {
  const processes = metrics.map((metric) => ({
    pid: metric.pid,
    name: metric.type === "Tab" ? "Renderer" : metric.type,
    cpu: Math.max(0, Math.round(metric.cpu.percentCPUUsage * 10) / 10),
    memoryMb: Math.round(metric.memory.workingSetSize / 1024),
  })).sort((a, b) => b.memoryMb - a.memoryMb);
  return {
    memoryMb: processes.reduce((sum, metric) => sum + metric.memoryMb, 0),
    processes,
    systemMemoryMb: Math.round(totalBytes / 1024 / 1024),
    freeSystemMemoryMb: Math.round(freeBytes / 1024 / 1024),
  };
}

async function readPorts() {
  if (process.platform !== "win32") return null;
  try {
    const { stdout } = await exec(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "netstat.exe"), ["-ano", "-p", "tcp"], { windowsHide: true, timeout: 5000, maxBuffer: 2 * 1024 * 1024 });
    return parsePorts(stdout);
  } catch { return null; }
}

function createAwake(blocker) {
  let id = null;
  return {
    set(mode, hasAgents) {
      if (!["off", "on", "agents"].includes(mode) || typeof hasAgents !== "boolean") throw new Error("Invalid awake mode");
      const active = mode === "on" || (mode === "agents" && hasAgents);
      if (active && id === null) id = blocker.start("prevent-app-suspension");
      if (!active && id !== null) { blocker.stop(id); id = null; }
      return active;
    },
    stop() { if (id !== null) blocker.stop(id); id = null; },
  };
}

module.exports = { readLimits, readPorts, parseLimits, parsePorts, formatResourceMetrics, createAwake };
