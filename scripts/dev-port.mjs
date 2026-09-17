import { execSync } from "node:child_process";

/** PIDs listening on an exact TCP port (not :14220 when freeing :1422). */
export function pidsOnPort(port) {
  const want = String(port);

  if (process.platform === "win32") {
    try {
      // No `-p tcp`: that filter hides IPv6, and Vite listens on [::1].
      const out = execSync("netstat -ano", {
        stdio: ["ignore", "pipe", "ignore"],
      }).toString();
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        const [proto, local, , state, pid] = line.trim().split(/\s+/);
        if (!proto?.toUpperCase().startsWith("TCP")) continue;
        if (!state?.toUpperCase().startsWith("LISTEN")) continue;
        if (!local || local.slice(local.lastIndexOf(":") + 1) !== want) continue;
        if (pid && pid !== "0") pids.add(pid);
      }
      return [...pids];
    } catch {
      return [];
    }
  }

  try {
    const out = execSync(`lsof -nP -iTCP:${want} -sTCP:LISTEN -t`, {
      stdio: ["ignore", "pipe", "ignore"],
    }).toString();
    return out.split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

export function killPid(pid) {
  if (!pid || pid === String(process.pid)) return false;
  try {
    execSync(process.platform === "win32" ? `taskkill /F /PID ${pid}` : `kill -9 ${pid}`, {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export function killPort(port) {
  let killed = 0;
  for (const pid of pidsOnPort(port)) {
    if (killPid(pid)) {
      killed += 1;
      console.log(`[dev] freed port ${port} (killed pid ${pid})`);
    }
  }
  return killed;
}

export function killStaleVoxiva() {
  if (process.platform !== "win32") return;
  try {
    execSync("taskkill /F /IM voxiva-space.exe", { stdio: "ignore" });
    console.log("[dev] stopped previous voxiva-space.exe");
  } catch {
    // not running
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Kill orphans from a crashed dev session, then wait until the port is free.
 *
 * `killApp` stays off for the Vite side: Tauri starts `beforeDevCommand` alongside
 * `cargo run`, so once Rust is warm the app boots first and would kill itself here.
 */
export async function ensurePortFree(
  port,
  { attempts = 16, delayMs = 300, label = "dev", killApp = false } = {},
) {
  if (killApp) killStaleVoxiva();
  killPort(port);

  for (let i = 0; i < attempts; i += 1) {
    if (pidsOnPort(port).length === 0) return true;
    killPort(port);
    await sleep(delayMs);
  }

  const left = pidsOnPort(port);
  console.error(
    `[${label}] Port ${port} is still in use (pid${left.length > 1 ? "s" : ""}: ${left.join(", ")}).`,
  );
  console.error(`[${label}] Close other Voxiva / Vite windows, or run: npm run dev:kill`);
  return false;
}
