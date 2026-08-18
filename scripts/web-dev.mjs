import { execSync, spawn } from "node:child_process";
import { join } from "node:path";

const PORT = 1422;

function pidsOnPort(port) {
  if (process.platform === "win32") {
    try {
      const out = execSync(`netstat -ano -p tcp | findstr :${port}`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
      return [...new Set(out.split(/\r?\n/).map((l) => l.trim().match(/\s+(\d+)\s*$/)?.[1]).filter(Boolean))];
    } catch {
      return [];
    }
  }
  const out = execSync(`lsof -ti tcp:${port}`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
  return out.split(/\r?\n/).filter(Boolean);
}

for (const pid of pidsOnPort(PORT)) {
  try {
    execSync(process.platform === "win32" ? `taskkill /F /PID ${pid}` : `kill ${pid}`, { stdio: "ignore" });
    console.log(`[web:dev] freed port ${PORT} (killed pid ${pid})`);
  } catch {
    // already gone or no permission; vite will report if the port is truly stuck
  }
}

const vite = spawn(process.execPath, [join(process.cwd(), "node_modules", "vite", "bin", "vite.js")], {
  stdio: "inherit",
});

process.exitCode = await new Promise((resolve) => vite.on("exit", (code) => resolve(code ?? 1)));