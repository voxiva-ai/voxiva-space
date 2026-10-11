const path = require("node:path");
const { pathToFileURL } = require("node:url");
const readline = require("node:readline");
const http = require("node:http");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, WebContentsView, ipcMain, Menu, dialog, shell, protocol, net, session, powerSaveBlocker, screen } = require("electron");
const { readLimits, readPorts, formatResourceMetrics, createAwake } = require("./status.cjs");
const { bounds } = require("./pilot-bounds.cjs");
const { files, findComponentFiles, workspaceDiskUsage } = require("./files.cjs");
const { captureBeforeHide } = require("./view-visibility.cjs");
const vscode = require("./vscode.cjs");
const vault = require("./vault.cjs");
const inspector = require("./inspector.cjs");
const { createCompanion } = require("./companion.cjs");
const cookies = require("./cookies.cjs");
const { createUpdates } = require("./updates.cjs");
const { autoUpdater } = require("electron-updater");
const { ignoreBrokenPipe } = require("./console-pipe.cjs");
const fs = require("node:fs/promises");
const syncFs = require("node:fs");

ignoreBrokenPipe(process.stdout);
ignoreBrokenPipe(process.stderr);

const terminalCommands = new Set(["get_default_terminal_cwd", "get_app_metadata", "get_git_branch", "check_commands", "create_terminal_session", "write_terminal_session", "resize_terminal_session", "kill_terminal_session"]);
const backendCommands = new Set([...terminalCommands, "read_browser_cookies", "read_legacy_state"]);
const browserCommands = new Set(["browser_open", "browser_set_bounds", "browser_navigate", "browser_reload", "browser_hide", "browser_close", "browser_hide_all", "browser_close_all", "browser_open_devtools", "browser_page_meta", "browser_toggle_inspector", "browser_take_selection", "browser_inspector_snapshot", "browser_configure_inspector"]);
const fileCommands = new Set(["list_workspace_dir", "read_text_file", "write_text_file", "workspace_file_info", "read_binary_file", "create_workspace_dir", "write_temp_file"]);
const validLabel = (label) => typeof label === "string" && /^[\w-]{1,128}$/.test(label);
const webUrl = (raw) => { const url = new URL(raw); if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP(S) pages are allowed"); return url.href; };

protocol.registerSchemesAsPrivileged([{ scheme: "voxiva-media", privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }]);
const smoke = process.argv.includes("--smoke");
if (smoke) {
  const smokeProfile = syncFs.mkdtempSync(path.join(os.tmpdir(), "voxiva-electron-smoke-"));
  app.setPath("userData", smokeProfile);
  app.on("quit", () => { try { syncFs.rmSync(smokeProfile, { recursive: true, force: true }); } catch {} });
}

app.whenReady().then(() => {
  const allowedMedia = new Set();
  protocol.handle("voxiva-media", async (request) => {
    const file = decodeURIComponent(new URL(request.url).pathname.slice(1));
    if (!allowedMedia.has(file) || await fs.realpath(file).catch(() => null) !== file) return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).href);
  });
  const { width: workWidth, height: workHeight } = screen.getPrimaryDisplay().workAreaSize;
  const window = new BrowserWindow({
    width: Math.max(760, Math.min(1560, Math.floor(workWidth * 0.98))),
    height: Math.max(480, Math.min(1000, Math.floor(workHeight * 0.98))),
    minWidth: 760, minHeight: 480, show: false, center: true,
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
  const companion = createCompanion(event);
  const updates = createUpdates(app, autoUpdater);
  const awake = createAwake(powerSaveBlocker);
  window.webContents.on("render-process-gone", () => awake.stop());
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
    if (!backendCommands.has(command)) { reject(new Error("Command not available in Electron")); return; }
    if (!backend.stdin.writable) { reject(new Error("Rust backend is not running")); return; }
    const id = ++requestId;
    pending.set(id, { resolve, reject });
    backend.stdin.write(JSON.stringify({ id, command, args }) + "\n", (error) => {
      if (error && pending.delete(id)) reject(error);
    });
  });

  const showView = (view) => { view.visibilityVersion = (view.visibilityVersion || 0) + 1; if (!window.contentView.children.includes(view)) window.contentView.addChildView(view); };
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
        const blockLocalNavigation = (navEvent) => { try { webUrl(navEvent.url); } catch { navEvent.preventDefault(); } };
        view.webContents.on("will-navigate", blockLocalNavigation);
        view.webContents.on("will-redirect", blockLocalNavigation);
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
    if (command === "browser_hide") {
      await captureBeforeHide(view, (data) => event("browser://snapshot", { label, data }), hideView);
      return;
    }
    if (command === "browser_navigate") { await view.webContents.loadURL(webUrl(args.url)); return; }
    if (command === "browser_reload") { view.webContents.reload(); return; }
    if (command === "browser_open_devtools") { view.webContents.openDevTools({ mode: "detach" }); return; }
    if (command === "browser_page_meta") return { title: view.webContents.getTitle(), favicon: view.favicon || "" };
    if (["browser_toggle_inspector", "browser_take_selection", "browser_inspector_snapshot", "browser_configure_inspector"].includes(command)) return inspector.command(view, command, args);
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
    if (terminalCommands.has(command)) {
      try { return await native(command, args); }
      catch (error) {
        if (["write_terminal_session", "resize_terminal_session", "kill_terminal_session"].includes(command) && error.message === "Terminal session not found") return null;
        throw error;
      }
    }
    if (command === "status_snapshot") {
      return { limits: await readLimits(), ...formatResourceMetrics(app.getAppMetrics(), os.totalmem(), os.freemem()) };
    }
    if (command === "workspace_disk_usage") return workspaceDiskUsage(args);
    if (command === "status_ports") return readPorts();
    if (command === "status_awake") return awake.set(args.mode, args.hasAgents);
    if (browserCommands.has(command)) return browser(command, args);
    if (fileCommands.has(command)) {
      const result = await files(command, args);
      if (command === "workspace_file_info") allowedMedia.add(result.absolutePath);
      return result;
    }
    if (command.startsWith("window_")) return windowCommand(command, args);
    if (command === "pick_workspace_folder") {
      const start = typeof args.startDir === "string" ? args.startDir : undefined;
      const result = await dialog.showOpenDialog(window, { properties: ["openDirectory"], defaultPath: start });
      return result.canceled ? null : result.filePaths[0];
    }
    if (command === "open_url") { await shell.openExternal(webUrl(args.url)); return; }
    if (command === "open_in_explorer") {
      const folder = await fs.realpath(args.request?.path);
      if (!(await fs.stat(folder)).isDirectory()) throw new Error("Path is not a directory");
      const error = await shell.openPath(folder);
      if (error) throw new Error(error);
      return;
    }
    if (command === "open_in_code") return vscode.openDesktop(args.request?.path);
    if (command === "ensure_vscode_serve_web") return vscode.ensure();
    if (command === "vscode_serve_web_folder_url") return vscode.folderUrl(args.folder);
    if (command === "scan_vault_sessions") return vault.scan(args.request);
    if (command === "find_component_files") return findComponentFiles(args);
    if (command === "write_annotate_context") {
      if (typeof args.content !== "string" || !args.content.trim() || Buffer.byteLength(args.content) > 500_000) throw new Error("Invalid annotation");
      return files("write_temp_file", { request: { contentsBase64: Buffer.from(args.content).toString("base64"), extension: "md" } });
    }
    if (command === "companion_status") return companion.status();
    if (command === "companion_start") return companion.start(args.token, args.workspaceId);
    if (command === "companion_stop") return companion.stop();
    if (command === "companion_set_workspace") return companion.setWorkspace(args.workspaceId);
    if (command === "companion_push_snapshot") return companion.pushSnapshot(args.snapshot);
    if (command === "companion_append_output") return companion.appendOutput(args.sessionId, args.data);
    if (command === "browser_list_cookie_sources") return cookies.sources;
    if (command === "browser_import_cookies") return cookies.importCookies(native, session.fromPartition("persist:voxiva-browser"), args.request);
    if (command === "browser_passkey_support") return { webauthn: true, httpsRequired: true, localhostOk: true };
    if (command === "read_legacy_state") return smoke ? null : native(command);
    if (command === "app_check_for_updates") return updates.check();
    if (command === "app_install_update") return updates.install();
    throw new Error(`Electron command not yet ported: ${command}`);
  });
  window.on("resize", () => event("window://resized", {}));
  window.once("ready-to-show", () => { if (!smoke) { window.show(); window.focus(); } });
  window.on("closed", () => {
    awake.stop();
    ipcMain.removeHandler("voxiva:invoke");
    for (const label of [...views.keys()]) closeView(label);
    backend.stdin.end();
    if (!backend.killed) backend.kill();
    vscode.stop();
    void companion.stop();
  });
  if (smoke) {
    const timeout = setTimeout(() => { console.error("Electron app smoke timed out"); app.exit(1); }, 60000);
    window.webContents.once("did-finish-load", async () => {
      try {
        const result = await window.webContents.executeJavaScript("(async () => ({ mounted: document.getElementById('root')?.childElementCount, cwd: await window.voxiva.invoke('get_default_terminal_cwd') }))()");
        if (!result.mounted || !result.cwd) throw new Error(`App did not mount: ${JSON.stringify(result)}`);
        const status = await window.webContents.executeJavaScript(`(async () => {
          const snapshot = await window.voxiva.invoke('status_snapshot');
          if (!Number.isFinite(snapshot.memoryMb)) throw new Error('Missing process memory');
          for (const mode of ['on', 'agents', 'off']) {
            const active = await window.voxiva.invoke('status_awake', { mode, hasAgents: false });
            if (active !== (mode === 'on')) throw new Error('Incorrect awake state');
          }
          const bar = document.querySelector('.vs-statusBar');
          if (!bar || Math.abs(bar.getBoundingClientRect().bottom - innerHeight) > 1) throw new Error('Status bar is not at the bottom');
          if (!document.querySelector('.vs-statusMemory') || !document.querySelector('.vs-statusAgents')) throw new Error('Status actions are missing from the status bar');
          const viewIds = ['space', 'projects', 'agents', 'board', 'history', 'browser', 'settings'];
          const waitFor = (check, label) => new Promise((resolve, reject) => {
            const start = Date.now();
            const poll = () => {
              const value = check();
              if (value) resolve(value);
              else if (Date.now() - start > 10000) reject(new Error('Timed out waiting for ' + label));
              else setTimeout(poll, 25);
            };
            poll();
          });
          for (const index of [1, 2, 3, 4, 5]) {
            window.dispatchEvent(new Event('voxiva-help-open'));
            const navigation = await waitFor(() => document.querySelectorAll('.vs-helpNav button')[index], 'help navigation ' + index);
            navigation.click();
            (await waitFor(() => document.querySelector('.vs-helpDetail .vs-btnPrimary'), 'help action ' + index)).click();
            await waitFor(() => {
              const slot = document.querySelector('.vs-viewSlot.is-active');
              return slot?.dataset.viewSlot === viewIds[index] && !slot.querySelector('.vs-pageLoading') ? slot : null;
            }, viewIds[index] + ' view');
          }
          for (const id of ['awake', 'usage', 'ports', 'resources']) {
            document.querySelector('button[popovertarget="status-' + id + '"]').click();
            const popup = document.getElementById('status-' + id);
            if (!popup.matches(':popover-open')) throw new Error('Status popup did not open: ' + id);
            const rect = popup.getBoundingClientRect();
            if (rect.left < 0 || rect.right > innerWidth || rect.bottom > bar.getBoundingClientRect().top) throw new Error('Status popup out of bounds');
            if (id === 'usage') {
              const compact = popup.querySelector('[aria-pressed="false"]');
              if (!popup.querySelector('.vs-usageProviders, .vs-usageEmpty') || !compact) throw new Error('Usage details did not render');
              compact.click();
              await new Promise(resolve => setTimeout(resolve, 50));
              if (!popup.classList.contains('is-compact')) throw new Error('Compact usage view did not activate');
            }
            popup.hidePopover();
          }
          const settingsButton = document.querySelector('[data-view-trigger="settings"]');
          if (!settingsButton) throw new Error('Settings button missing');
          settingsButton.click();
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          if (!document.querySelector('.vs-root.is-settingsView') || getComputedStyle(document.querySelector('.vs-sidebar')).display !== 'none') throw new Error('Settings did not open as a full-screen view');
          const settings = await new Promise((resolve, reject) => { const start = Date.now(); const poll = () => {
            const page = document.querySelector('.vs-settingsLayout');
            const back = document.querySelector('.vs-settingsBack');
            const rect = page?.getBoundingClientRect();
            if (page && back && rect?.width > 0 && rect.height > 0 && getComputedStyle(page).visibility !== 'hidden') resolve({ width: rect.width, height: rect.height });
            else if (Date.now() - start > 5000) reject(new Error('Settings page is not visible: ' + JSON.stringify({ root: document.querySelector('.vs-root')?.className, page: Boolean(page), rect: rect && { width: rect.width, height: rect.height } })));
            else setTimeout(poll, 25);
          }; poll(); });
          if (settings.width < 500 || settings.height < 300) throw new Error('Settings page did not fill the window: ' + JSON.stringify(settings));
          const sections = [...document.querySelectorAll('.vs-settingsNavItem')];
          if (sections.length !== 10) throw new Error('Expected 10 settings sections, found ' + sections.length);
          for (const section of sections) {
            section.click();
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            if (!section.classList.contains('is-active') || !document.querySelector('.vs-settingsPanel h1')?.textContent.trim() || !document.querySelector('.vs-settingsPanelBody')) throw new Error('Settings section failed to render: ' + section.textContent.trim());
          }
          document.querySelector('.vs-settingsBack').click();
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          if (document.querySelector('.vs-root.is-settingsView')) throw new Error('Settings did not return to the workspace');
          return true;
        })()`);
        if (!status) throw new Error("Status bar smoke failed");
        await window.webContents.executeJavaScript("document.querySelector('button[popovertarget=\"status-usage\"]').click(); new Promise(resolve => setTimeout(resolve, 100))");
        const usagePreview = path.join(os.tmpdir(), "voxiva-usage-smoke.png");
        await fs.writeFile(usagePreview, (await window.webContents.capturePage()).toPNG());
        await window.webContents.executeJavaScript("document.getElementById('status-usage').hidePopover()");
        console.log(`Usage preview: ${usagePreview}`);
        await window.webContents.executeJavaScript("document.querySelector('button[popovertarget=\"status-resources\"]').click(); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
        const resourceOpen = await window.webContents.executeJavaScript("document.getElementById('status-resources').matches(':popover-open')");
        if (!resourceOpen) throw new Error("Resource manager did not stay open for capture");
        const resourcePreview = path.join(os.tmpdir(), "voxiva-resource-smoke.png");
        await fs.writeFile(resourcePreview, (await window.webContents.capturePage()).toPNG());
        await window.webContents.executeJavaScript("document.getElementById('status-resources').hidePopover(); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
        console.log(`Resource manager preview: ${resourcePreview}`);
        await window.webContents.executeJavaScript(`document.querySelector('[data-view-trigger="settings"]').click()`);
        const settingsFrame = await window.webContents.executeJavaScript("new Promise((resolve,reject)=>{const start=Date.now();const poll=()=>{const page=document.querySelector('.vs-settingsLayout');const r=page?.getBoundingClientRect();const active=document.querySelector('.vs-root.is-settingsView');const button=document.querySelector('[data-view-trigger=\\\"settings\\\"]');if(active&&page&&r?.width>0&&r.height>0&&button?.getAttribute('aria-pressed')==='true')requestAnimationFrame(()=>requestAnimationFrame(()=>resolve({width:r.width,height:r.height})));else if(Date.now()-start>5000)reject(new Error('Settings is not active/visible: '+JSON.stringify({active:!!active,rect:r&&[r.width,r.height],pressed:button?.getAttribute('aria-pressed')})));else setTimeout(poll,25)};poll()})");
        if (settingsFrame.width < 500 || settingsFrame.height < 300) throw new Error(`Settings frame is too small: ${JSON.stringify(settingsFrame)}`);
        const settingsPreview = path.join(os.tmpdir(), "voxiva-settings-smoke.png");
        await fs.writeFile(settingsPreview, (await window.webContents.capturePage()).toPNG());
        console.log(`Settings preview: ${settingsPreview}`);
        window.setSize(760, 600);
        const fits = await window.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => {
          const bar = document.querySelector('.vs-statusBar');
          resolve(bar.scrollWidth <= bar.clientWidth);
        }))`);
        if (!fits) throw new Error("Status bar overflows at minimum window width");
        window.setSize(1240, 780);
        const statusPreview = path.join(os.tmpdir(), "voxiva-status-smoke.png");
        await fs.writeFile(statusPreview, (await window.webContents.capturePage()).toPNG());
        console.log(`Status bar preview: ${statusPreview}`);
        const created = await native("create_terminal_session", { request: { cwd: result.cwd, shell: null, title: "Smoke", cols: 80, rows: 24 } });
        await native("kill_terminal_session", { request: { id: created.id } });
        const local = http.createServer((_request, response) => { response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><title>Inspector smoke</title><button>Test</button>"); });
        await new Promise((resolve) => local.listen(0, "127.0.0.1", resolve));
        try {
          const label = "browser-smoke";
          await browser("browser_open", { label, url: `http://127.0.0.1:${local.address().port}/`, x: 0, y: 0, width: 800, height: 500 });
          if (!await browser("browser_toggle_inspector", { label, enabled: true })) throw new Error("Browser inspector did not enable");
          const snapshot = await browser("browser_inspector_snapshot", { label });
          if (!snapshot.enabled) throw new Error("Browser inspector state was lost");
          await browser("browser_configure_inspector", { label, agents: [{ id: "shell", name: "Shell" }], files: [] });
          await browser("browser_toggle_inspector", { label, enabled: false });
          await browser("browser_close", { label });
        } finally { local.close(); }
        console.log("Electron React shell, IPC, Rust PTY, and Chromium inspector passed");
        clearTimeout(timeout);
        app.exit(0);
      } catch (error) {
        console.error(error);
        clearTimeout(timeout);
        app.exit(1);
      }
    });
  }
  void window.loadFile(path.join(__dirname, "..", "dist", "index.html"), smoke ? { query: { smoke: "1" } } : undefined);
});

app.on("window-all-closed", () => app.quit());
