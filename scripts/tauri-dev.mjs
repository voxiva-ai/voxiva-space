import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

// A crashed previous session can leave the debug app running; it then shadows
// the new instance and keeps `tauri dev` from showing the window. Kill it.
if (process.platform === "win32") {
  try {
    execSync("taskkill /F /IM voxiva-space.exe", { stdio: "ignore" });
  } catch {
    // nothing was running
  }
}

// GUI terminals can inherit PATH from before Rust was installed.
const cargoBin = join(homedir(), ".cargo", "bin");
const path = process.env.PATH || "";
const env = {
  ...process.env,
  PATH: existsSync(cargoBin) && !path.split(delimiter).includes(cargoBin)
    ? `${cargoBin}${delimiter}${path}`
    : path,
};

spawn(process.execPath, [join(process.cwd(), "node_modules", "@tauri-apps", "cli", "tauri.js"), "dev"], {
  stdio: "inherit",
  env,
})
  .on("exit", (code) => process.exit(code ?? 1));
