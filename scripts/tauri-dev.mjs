import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

const DEV_PORT = 1422;

function pidsOnPort(port) {
  if (process.platform !== "win32") return [];
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

function freeDevPort(port) {
  for (const pid of pidsOnPort(port)) {
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
      console.log(`[dev] freed port ${port} (killed pid ${pid})`);
    } catch {
      // already gone
    }
  }
}

const cargoBin = join(homedir(), ".cargo", "bin");
const cargoExe = join(cargoBin, process.platform === "win32" ? "cargo.exe" : "cargo");
const projectTarget = join(process.cwd(), "src-tauri", "target");
const path = process.env.PATH || "";
const env = {
  ...process.env,
  // Stable target dir — avoids full rebuild when the sandbox cache path changes.
  CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR || projectTarget,
  PATH: existsSync(cargoBin) && !path.split(delimiter).includes(cargoBin)
    ? `${cargoBin}${delimiter}${path}`
    : path,
};

// A crashed session can leave the debug binary or orphan Vite on :1422.
if (process.platform === "win32") {
  try {
    execSync("taskkill /F /IM voxiva-space.exe", { stdio: "ignore" });
  } catch {
    // nothing was running
  }
  freeDevPort(DEV_PORT);
}

if (!existsSync(cargoExe)) {
  console.error(
    "\n[dev] Rust/Cargo not found. Install from https://rustup.rs then restart the terminal.\n",
  );
  process.exit(1);
}

console.log("[dev] Starting Voxiva Space desktop app (Tauri)…");
console.log("[dev] First compile can take a few minutes. Do not open localhost:1422 in a browser.\n");

const child = spawn(
  process.execPath,
  [join(process.cwd(), "node_modules", "@tauri-apps", "cli", "tauri.js"), "dev"],
  { stdio: "inherit", env, shell: false },
);

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});

child.on("error", (err) => {
  console.error("[dev] Failed to start Tauri:", err.message);
  process.exit(1);
});
