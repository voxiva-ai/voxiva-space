const path = require("node:path");
const readline = require("node:readline");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, WebContentsView, ipcMain, Menu, dialog, shell } = require("electron");
const { bounds } = require("./pilot-bounds.cjs");

const terminalCommands = new Set(["get_default_terminal_cwd", "get_app_metadata", "get_git_branch", "check_commands", "create_terminal_session", "write_terminal_session", "resize_terminal_session", "kill_terminal_session"]);
const browserCommands = new Set(["browser_open", "browser_set_bounds", "browser_navigate", "browser_reload", "browser_hide", "browser_close", "browser_hide_all", "browser_close_all", "browser_open_devtools", "browser_page_meta", "browser_toggle_inspector", "browser_take_selection", "browser_configure_inspector"]);
const validLabel = (label) => typeof label === "string" && /^[\w-]{1,128}$/.test(label);
const webUrl = (raw) => { const url = new URL(raw); if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP(S) pages are allowed"); return url.href; };

app.whenReady().then(() => {
  const smoke = process.argv.includes("--smoke");
  const window = new BrowserWindow({
    width: 1240, height: 780, minWidth: 960, minHeight: 620, show: false,
    frame: false, backgroundColor: "#10151d",
    webPreferences: { preload: path.join(__dirname, "app-preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  const views = new Map();
  const pending = new Map();
  let requestId = 0;
  const backendPath = app.isPackaged
    ? path.join(process.resourcesPath, process.platform === "win32" ? "voxiva-backend.exe" : "voxiva-backend")
    : path.join(__dirname, "..", "native", "target", "debug", process.platform === "win32" ? "voxiva-backend.exe" : "voxiva-backend");
  const backend = spawn(backendPath, [], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const event = (name, payload) => { if (!window.isDestroyed()) window.webContents.send("voxiva:event", name, payload); };
  readline.createInterface({ input: backend.stdout }).on("line", (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.event) { event(message.event, message.payload); return; }
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error));
    else waiter.resolve(message.result);
  });
  const failPending = (message) => { for (const waiter of pending.values()) waiter.reject(new Error(message)); pending.clear(); };
  backend.on("error", (error) => failPending(`Rust backend failed: ${error.message}`));
  backend.on("exit", (code) => failPending(`Rust backend exited (${code})`));
  const native = (command, args = {}) => new Promise((resolve, reject) => {
    if (!terminalCommands.has(command)) { reject(new Error("Command not available in Electron")); return; }
    if (!backend.stdin.writable) { reject(new Error("Rust backend is not running")); return; }
    const id = ++requestId;
    pending.set(id, { resolve, reject });
    backend.stdin.write(JSON.stringify({ id, command, args }) + "\n", (error) => {
      if (error && pending.delete(id)) reject(error);
    });
  });

  const showView = (view) => { if (!window.contentView.children.includes(view)) window.contentView.addChildView(view); };
  const hideView = (view) => { if (window.contentView.children.includes(view)) window.contentView.removeChildView(view); };
  const closeView = (label) => { const view = views.get(label); if (!view) return; hideView(view); view.webContents.close(); views.delete(label); };
  const browser = async (command, args = {}) => {
    if (command === "browser_hide_all") { for (const view of views.values()) hideView(view); return; }
    if (command === "browser_close_all") { for (const label of [...views.keys()]) if (label !== args.except) closeView(label); return; }
    const label = args.label;
    if (!validLabel(label)) throw new Error("Invalid browser label");
    if (command === "browser_close") { closeView(label); return; }
    let view = views.get(label);
    if (command === "browser_open") {
      const url = webUrl(args.url);
      if (!view) {
        view = new WebContentsView({ webPreferences: { partition: "persist:voxiva-browser", sandbox: true, contextIsolation: true, nodeIntegration: false } });
        view.webContents.setWindowOpenHandler(({ url: target }) => { try { event("browser://new-window", { label, url: webUrl(target) }); } catch {} return { action: "deny" }; });
        view.webContents.on("did-start-loading", () => event("browser://load", { label, url: view.webContents.getURL(), state: "started" }));
        view.webContents.on("did-stop-loading", () => event("browser://load", { label, url: view.webContents.getURL(), state: "finished" }));
        view.webContents.on("page-favicon-updated", (_event, icons) => { view.favicon = icons[0] || ""; });
        view.webContents.on("context-menu", (_event, params) => {
          Menu.buildFromTemplate([
            { role: "copy", enabled: Boolean(params.selectionText) },
            { type: "separator" },
            { label: "Back", enabled: view.webContents.navigationHistory.canGoBack(), click: () => view.webContents.navigationHistory.goBack() },
            { label: "Reload", click: () => view.webContents.reload() },
          ]).popup({ window });
        });
        views.set(label, view);
      }
      showView(view);
      view.setBounds(bounds(args, window.getContentBounds()));
      if (args.navigate !== false || !view.webContents.getURL()) await view.webContents.loadURL(url);
      return;
    }
    if (!view) throw new Error("Browser pane not found");
    if (command === "browser_set_bounds") { showView(view); view.setBounds(bounds(args, window.getContentBounds())); return; }
    if (command === "browser_hide") { hideView(view); return; }
    if (command === "browser_navigate") { await view.webContents.loadURL(webUrl(args.url)); return; }
    if (command === "browser_reload") { view.webContents.reload(); return; }
    if (command === "browser_open_devtools") { view.webContents.openDevTools({ mode: "detach" }); return; }
    if (command === "browser_page_meta") return { title: view.webContents.getTitle(), favicon: view.favicon || "" };
    if (command === "browser_toggle_inspector") return false;
    if (command === "browser_take_selection") return null;
    if (command === "browser_configure_inspector") return;
  };

  const windowCommand = async (command, args = {}) => {
    const [value] = args.args || [];
    switch (command) {
      case "window_show": if (!smoke) window.show(); break;
      case "window_unminimize": window.restore(); break;
      case "window_set_focus": window.focus(); break;
      case "window_minimize": window.minimize(); break;
      case "window_toggle_maximize": window.isMaximized() ? window.unmaximize() : window.maximize(); break;
      case "window_is_maximized": return window.isMaximized();
      case "window_close": window.close(); break;
      case "window_start_dragging": break;
      case "window_is_fullscreen": return window.isFullScreen();
      case "window_set_fullscreen": window.setFullScreen(Boolean(value)); break;
      case "window_set_title": window.setTitle(String(value || "Voxiva Space")); break;
      default: throw new Error("Unknown window command");
    }
  };

  ipcMain.handle("voxiva:invoke", async (eventSource, command, args = {}) => {
    if (eventSource.sender !== window.webContents || typeof command !== "string" || !args || typeof args !== "object") throw new Error("Invalid app request");
    if (terminalCommands.has(command)) return native(command, args);
    if (browserCommands.has(command)) return browser(command, args);
    if (command.startsWith("window_")) return windowCommand(command, args);
    if (command === "pick_workspace_folder") {
      const start = typeof args.startDir === "string" ? args.startDir : undefined;
      const result = await dialog.showOpenDialog(window, { properties: ["openDirectory"], defaultPath: start });
      return result.canceled ? null : result.filePaths[0];
    }
    if (command === "open_url") { await shell.openExternal(webUrl(args.url)); return; }
    if (command === "open_in_explorer") { shell.showItemInFolder(args.request?.path); return; }
    throw new Error(`Electron command not yet ported: ${command}`);
  });
  window.on("resize", () => event("window://resized", {}));
  window.on("closed", () => {
    ipcMain.removeHandler("voxiva:invoke");
    for (const label of [...views.keys()]) closeView(label);
    backend.stdin.end();
    if (!backend.killed) backend.kill();
  });
  if (smoke) {
    const timeout = setTimeout(() => { console.error("Electron app smoke timed out"); app.exit(1); }, 15000);
    window.webContents.once("did-finish-load", async () => {
      try {
        const result = await window.webContents.executeJavaScript("(async () => ({ mounted: document.getElementById('root')?.childElementCount, cwd: await window.voxiva.invoke('get_default_terminal_cwd') }))()");
        if (!result.mounted || !result.cwd) throw new Error(`App did not mount: ${JSON.stringify(result)}`);
        const created = await native("create_terminal_session", { request: { cwd: result.cwd, shell: null, title: "Smoke", cols: 80, rows: 24 } });
        await native("kill_terminal_session", { request: { id: created.id } });
        console.log("Electron React shell, IPC, and Rust PTY passed");
        clearTimeout(timeout);
        app.exit(0);
      } catch (error) {
        console.error(error);
        clearTimeout(timeout);
        app.exit(1);
      }
    });
  }
  void window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
});

app.on("window-all-closed", () => app.quit());
