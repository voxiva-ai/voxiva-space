import { execSync, spawn } from "node:child_process";
import { join } from "node:path";

const PORT = 1422;

function pidsOnPort(port) {
  if (process.platform === "win32") {
    try {
      const out = execSync(`netstat -ano -p tcp | findstr :${port}`, {
        stdio: ["ignore", "pipe", "ignore"],
      }).toString();
      return [
        ...new Set(
          out
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.includes("LISTENING"))
            .map((l) => l.match(/\s+(\d+)\s*$/)?.[1])
            .filter((pid) => pid && pid !== "0"),
        ),
      ];
    } catch {
      return [];
    }
  }
  try {
    const out = execSync(`lsof -ti tcp:${port}`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
    return out.split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

function killPort(port) {
  for (const pid of pidsOnPort(port)) {
    if (pid === String(process.pid)) continue;
    try {
      execSync(process.platform === "win32" ? `taskkill /F /PID ${pid}` : `kill -9 ${pid}`, {
        stdio: "ignore",
      });
      console.log(`[web:dev] freed port ${port} (killed pid ${pid})`);
    } catch {
      // already gone
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensurePortFree(port, attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    killPort(port);
    if (pidsOnPort(port).length === 0) return;
    await sleep(250);
  }
  console.error(`[web:dev] Port ${port} is still in use. Close other Voxiva/Vite instances and retry.`);
  process.exit(1);
}

await ensurePortFree(PORT);

console.log("[web:dev] Vite for Tauri embed — use `npm run dev` for the desktop window.\n");

function startVite() {
  return spawn(process.execPath, [join(process.cwd(), "node_modules", "vite", "bin", "vite.js")], {
    stdio: "inherit",
  });
}

let vite = startVite();
process.exitCode = await new Promise((resolve) => {
  vite.on("exit", async (code) => {
    if (code === 0) {
      resolve(0);
      return;
    }
    if (pidsOnPort(PORT).length > 0) {
      await ensurePortFree(PORT);
      vite = startVite();
      vite.on("exit", (retryCode) => resolve(retryCode ?? 1));
      return;
    }
    resolve(code ?? 1);
  });
});
