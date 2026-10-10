const fs = require("node:fs/promises");
const path = require("node:path");
const net = require("node:net");
const { randomBytes } = require("node:crypto");
const { spawn } = require("node:child_process");

let server;
let starting;

async function codeCli() {
  const names = process.platform === "win32" ? ["code.cmd", "code.bat"] : ["code"];
  const dirs = (process.env.PATH || "").split(path.delimiter);
  if (process.platform === "win32") {
    for (const base of [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs"), process.env.ProgramFiles, "C:\\", "D:\\", "E:\\"])
      if (base) dirs.push(path.join(base, "Microsoft VS Code", "bin"));
  } else if (process.platform === "darwin") {
    dirs.push("/Applications/Visual Studio Code.app/Contents/Resources/app/bin");
    dirs.push(path.join(process.env.HOME || "", "Applications/Visual Studio Code.app/Contents/Resources/app/bin"));
  }
  for (const dir of dirs) for (const name of names) {
    const candidate = path.join(dir, name);
    if ((await fs.stat(candidate).catch(() => null))?.isFile()) return candidate;
  }
  throw new Error("VS Code CLI (`code`) was not found. Install VS Code and add its bin directory to PATH.");
}

async function serverCommand(cli) {
  if (process.platform !== "win32") return { command: cli, prefix: [], env: process.env };
  const root = path.dirname(path.dirname(cli));
  const candidates = [root, ...(await fs.readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).map((entry) => path.join(root, entry.name))];
  for (const dir of candidates) {
    const script = path.join(dir, "resources", "app", "out", "cli.js");
    if ((await fs.stat(script).catch(() => null))?.isFile()) {
      return { command: path.join(root, "Code.exe"), prefix: [script], env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } };
    }
  }
  throw new Error("VS Code CLI script was not found beside Code.exe.");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const port = listener.address().port;
      listener.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function listening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
    socket.setTimeout(500, () => { socket.destroy(); resolve(false); });
  });
}

async function start() {
  if (server && await listening(server.info.port)) return server.info;
  const cli = await codeCli();
  const runner = await serverCommand(cli);
  const port = await freePort();
  const connectionToken = randomBytes(24).toString("hex");
  const child = spawn(runner.command, [...runner.prefix, "serve-web", "--host", "127.0.0.1", "--port", String(port), "--connection-token", connectionToken, "--accept-server-license-terms"], {
    env: runner.env, windowsHide: true, stdio: "ignore",
  });
  const info = { baseUrl: `http://127.0.0.1:${port}`, connectionToken, port };
  server = { child, info };
  let spawnError;
  child.once("error", (error) => { spawnError = error; });
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (spawnError || child.exitCode !== null) break;
    if (await listening(port)) return info;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  stop();
  throw new Error(`VS Code serve-web did not start: ${spawnError?.message || child.exitCode || "timeout"}`);
}

async function ensure() {
  if (!starting) starting = start().finally(() => { starting = null; });
  return starting;
}

async function openDesktop(folder) {
  if (typeof folder !== "string" || !folder.trim()) throw new Error("Folder path is empty");
  const real = await fs.realpath(folder.trim());
  if (!(await fs.stat(real)).isDirectory()) throw new Error("Path is not a directory");
  const cli = await codeCli();
  const command = process.platform === "win32" ? path.join(path.dirname(path.dirname(cli)), "Code.exe") : process.platform === "darwin" ? "open" : cli;
  const args = process.platform === "darwin" ? ["-a", "Visual Studio Code", real] : [real];
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, windowsHide: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}

function folderQueryValue(real) {
  const normalized = real.replace(/^\\\\\?\\/, "").replaceAll("\\", "/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

async function folderUrl(folder) {
  if (typeof folder !== "string" || !folder.trim()) throw new Error("Folder path is empty");
  const real = await fs.realpath(folder.trim());
  if (!(await fs.stat(real)).isDirectory()) throw new Error("Path is not a directory");
  const info = await ensure();
  const url = new URL(info.baseUrl);
  url.searchParams.set("folder", folderQueryValue(real));
  url.searchParams.set("tkn", info.connectionToken);
  return url.href;
}

function stop() {
  if (!server) return;
  const { child } = server;
  server = null;
  if (child.pid && process.platform === "win32") spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else if (!child.killed) child.kill();
}

module.exports = { ensure, folderUrl, folderQueryValue, openDesktop, stop };
