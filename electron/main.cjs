const path = require("node:path");
const { pathToFileURL } = require("node:url");
const readline = require("node:readline");
const http = require("node:http");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, WebContentsView, ipcMain, Menu, dialog, shell, protocol, net, session, powerSaveBlocker, screen, safeStorage } = require("electron");
const { readCodexSubscription, readLimits, readPorts, formatResourceMetrics, createAwake } = require("./status.cjs");
const { bounds } = require("./pilot-bounds.cjs");
const { files, findComponentFiles, workspaceDiskUsage } = require("./files.cjs");
const { captureBeforeHide } = require("./view-visibility.cjs");
const vscode = require("./vscode.cjs");
const vault = require("./vault.cjs");
const inspector = require("./inspector.cjs");
const { createCompanion } = require("./companion.cjs");
const cookies = require("./cookies.cjs");
const { createUpdates } = require("./updates.cjs");
const { createProviderAccounts } = require("./provider-accounts.cjs");
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
    webPreferences: { preload: path.join(__dirname, "app-preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: !smoke },
  });
  window.webContents.on("context-menu", (_event, params) => {
    if (!params.isEditable && !params.selectionText) return;
    Menu.buildFromTemplate([
      { role: "copy", enabled: Boolean(params.selectionText) },
      { role: "paste", enabled: Boolean(params.isEditable) },
      { type: "separator" },
      { role: "selectAll" },
    ]).popup({ window });
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
  const providerAccounts = createProviderAccounts(safeStorage, path.join(app.getPath("userData"), "provider-accounts.json"));
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
      const [limits, subscription] = await Promise.all([readLimits(), readCodexSubscription()]);
      return { limits, subscription, ...formatResourceMetrics(app.getAppMetrics(), os.totalmem(), os.freemem()) };
    }
    if (command === "provider_accounts_list") return providerAccounts.list();
    if (command === "provider_account_save") return providerAccounts.save(args.id, args.secret);
    if (command === "provider_account_remove") return providerAccounts.remove(args.id);
    if (command === "provider_account_usage") return providerAccounts.usage(args.id);
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
    if (command === "app_restart") { app.relaunch(); app.exit(0); return; }
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
    window.webContents.on("console-message", (event) => { if (event.message?.startsWith("Smoke stage:")) console.log(event.message); });
    const timeout = setTimeout(() => { console.error("Electron app smoke timed out"); app.exit(1); }, 60000);
    window.webContents.once("did-finish-load", async () => {
      try {
        const result = await window.webContents.executeJavaScript("(async () => ({ mounted: document.getElementById('root')?.childElementCount, cwd: await window.voxiva.invoke('get_default_terminal_cwd') }))()");
        if (!result.mounted || !result.cwd) throw new Error(`App did not mount: ${JSON.stringify(result)}`);
        window.setSize(863, 680);
        await new Promise(resolve => setTimeout(resolve, 80));
        const statusScript = `(async () => {
          console.log('Smoke stage: status and navigation');
          const snapshot = await window.voxiva.invoke('status_snapshot');
          if (!Number.isFinite(snapshot.memoryMb)) throw new Error('Missing process memory');
          for (const mode of ['on', 'agents', 'off']) {
            const active = await window.voxiva.invoke('status_awake', { mode, hasAgents: false });
            if (active !== (mode === 'on')) throw new Error('Incorrect awake state');
          }
          const bar = document.querySelector('.vs-statusBar');
          if (!bar || Math.abs(bar.getBoundingClientRect().bottom - innerHeight) > 1) throw new Error('Status bar is not at the bottom');
          if (!document.querySelector('.vs-statusMemory') || !document.querySelector('.vs-statusPorts') || document.querySelector('.vs-statusAgents')) throw new Error('Status actions are missing from the status bar');
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
              if (!popup.querySelector('.vs-usageProviders, .vs-usageEmpty') || !compact || popup.querySelector('.vs-usageDetailsLink')) throw new Error('Usage details did not render or still links to a separate page');
              const provider = popup.querySelector('.vs-usageProvider');
              if (provider) {
                provider.click();
                const detail = await waitFor(() => popup.querySelector('.vs-usageDetail'), 'usage agent detail');
                const detailRect = detail.getBoundingClientRect();
                if (getComputedStyle(popup).overflowX !== 'visible' || detailRect.right > innerWidth || detailRect.left < rect.right) throw new Error('Usage agent detail is clipped instead of opening beside the list');
                if (detailRect.top < 8 || detailRect.bottom > bar.getBoundingClientRect().top - 8) throw new Error('Usage agent detail extends outside the available window height');
              }
              compact.click();
              await new Promise(resolve => setTimeout(resolve, 50));
              if (!popup.classList.contains('is-compact')) throw new Error('Compact usage view did not activate');
            }
            popup.hidePopover();
          }
          const notificationButton = document.querySelector('.vs-notifyBtn');
          notificationButton.click();
          await new Promise(resolve => setTimeout(resolve, 100));
          const notificationMenu = document.querySelector('.is-notifyMenu');
          if (!notificationMenu) throw new Error('Notification menu did not render: ' + JSON.stringify({ expanded: notificationButton.getAttribute('aria-expanded'), sidebar: document.querySelector('.vs-sidebar')?.className, view: document.querySelector('.vs-viewSlot.is-active')?.dataset.viewSlot }));
          const notificationRect = notificationMenu.getBoundingClientRect();
          if (notificationRect.left < 0 || notificationRect.right > innerWidth || notificationRect.bottom > innerHeight || notificationRect.left < notificationButton.getBoundingClientRect().left - 1) throw new Error('Notification menu is clipped or opens on the wrong side');
          notificationButton.click();
          await waitFor(() => !document.querySelector('.is-notifyMenu'), 'notification menu close');
          const helpButton = document.querySelector('.vs-helpBtn');
          const helpMenu = document.querySelector('.vs-helpMenu');
          if (helpMenu.matches(':popover-open') || helpButton.getAttribute('aria-expanded') !== 'false' || getComputedStyle(helpMenu).display !== 'none' || helpMenu.getClientRects().length) throw new Error('Help menu should start visually closed');
          helpButton.click();
          await waitFor(() => helpMenu, 'help menu');
          await waitFor(() => helpMenu.matches(':popover-open') ? helpMenu : null, 'help menu open');
          await new Promise(resolve => setTimeout(resolve, 180));
          if (helpMenu.querySelectorAll('[role="menuitem"] svg').length < 8 || !helpMenu.querySelector('.vs-helpMenuClose')) throw new Error('Help menu actions or icons did not render');
          const helpRect = helpMenu.getBoundingClientRect();
          const helpButtonRect = helpButton.getBoundingClientRect();
          if (!helpMenu.matches(':popover-open') || helpRect.left < 0 || helpRect.right > innerWidth || helpRect.bottom > helpButtonRect.top + 2) throw new Error('Help menu is not anchored above its bottom button');
          helpMenu.querySelector('.vs-helpMenuClose').click();
          await waitFor(() => !helpMenu.matches(':popover-open'), 'help menu close');
          if (getComputedStyle(helpMenu).display !== 'none') throw new Error('Closed help menu is still visible');
          helpButton.click();
          await waitFor(() => helpMenu.matches(':popover-open') ? helpMenu : null, 'help menu toggle open');
          helpButton.click();
          await waitFor(() => !helpMenu.matches(':popover-open'), 'help menu toggle close');
          if (document.querySelector('.vs-sidebarNavigation')) throw new Error('Search and Tasks must not appear above the workspace list');
          const tool = (name) => document.querySelector('.vs-sidebarFooter [data-sidebar-tool="' + name + '"]');
          for (const name of ['reveal', 'workspace-board']) if (!tool(name)) throw new Error('Missing bottom toolbar action: ' + name);
          if (tool('search') || tool('tasks')) throw new Error('Removed Search and Tasks buttons are still present');
          window.dispatchEvent(new Event('voxiva-command-palette-open'));
          await waitFor(() => document.querySelector('.vs-palette[role="dialog"]'), 'search palette');
          document.querySelector('.vs-paletteScrim').click();
          await waitFor(() => !document.querySelector('.vs-palette[role="dialog"]'), 'search palette close');
          tool('workspace-board').click();
          await waitFor(() => document.querySelector('[data-view-slot="workspace-board"].is-active .vs-workspaceBoard'), 'workspace board');
          const activeWorkspaceRow = document.querySelector('.vs-workspaceList .vs-wsItem.is-active');
          if (activeWorkspaceRow) {
            tool('reveal').click();
            await waitFor(() => document.querySelector('[data-view-slot="space"].is-active'), 'reveal workspace');
            if (document.activeElement !== activeWorkspaceRow.querySelector('.vs-wsItemMain')) throw new Error('Reveal did not focus the active workspace');
          } else {
            if (!tool('reveal').disabled) throw new Error('Reveal should be disabled without an active workspace');
            tool('workspace-board').click();
            await waitFor(() => document.querySelector('[data-view-slot="space"].is-active'), 'workspace board close');
          }
          const settingsButton = document.querySelector('[data-view-trigger="settings"]');
          const workspaceLogoRect = document.querySelector('.vs-sidebarLogo').getBoundingClientRect();
          const workspaceNavFont = getComputedStyle(document.querySelector('.vs-wsItem strong') || document.body).fontSize;
          const zoomBeforeSettings = document.documentElement.style.zoom;
          console.log('Smoke stage: settings layout');
          if (!settingsButton) throw new Error('Settings button missing');
          settingsButton.click();
          await new Promise(resolve => setTimeout(resolve, 40));
          if (!document.querySelector('.vs-root.is-settingsView') || getComputedStyle(document.querySelector('.vs-sidebar')).display !== 'none') throw new Error('Settings did not open as a full-screen view');
          const settingsLogo = document.querySelector('.vs-topbarSettingsLogo');
          if (!settingsLogo?.querySelector('img') || document.querySelector('.vs-topbarNav')) throw new Error('Settings should show the brand logo instead of workspace navigation');
          const settingsLogoRect = settingsLogo.querySelector('img').getBoundingClientRect();
          if (Math.abs(settingsLogoRect.width - workspaceLogoRect.width) > 0.5 || Math.abs(settingsLogoRect.height - workspaceLogoRect.height) > 0.5 || Math.abs(settingsLogoRect.left - workspaceLogoRect.left) > 0.5 || Math.abs(settingsLogoRect.top - workspaceLogoRect.top) > 0.5) throw new Error('Logo size or position changes between workspace and settings');
          const settingsNavigation = await waitFor(() => document.querySelector('.vs-settingsNavItem'), 'settings navigation');
          if (getComputedStyle(settingsNavigation).fontSize !== workspaceNavFont || document.documentElement.style.zoom !== zoomBeforeSettings) throw new Error('Navigation text or zoom changes in settings');
          settingsLogo.click();
          await waitFor(() => !document.querySelector('.vs-root.is-settingsView'), 'settings logo return');
          settingsButton.click();
          await waitFor(() => document.querySelector('.vs-root.is-settingsView'), 'settings reopen');
          const settings = await new Promise((resolve, reject) => { const start = Date.now(); const poll = () => {
            const page = document.querySelector('.vs-settingsLayout');
            const back = document.querySelector('.vs-settingsBack');
            const rect = page?.getBoundingClientRect();
            if (page && back && rect?.width > 0 && rect.height > 0 && getComputedStyle(page).visibility !== 'hidden') resolve({ width: rect.width, height: rect.height });
            else if (Date.now() - start > 5000) reject(new Error('Settings page is not visible: ' + JSON.stringify({ root: document.querySelector('.vs-root')?.className, page: Boolean(page), rect: rect && { width: rect.width, height: rect.height } })));
            else setTimeout(poll, 25);
          }; poll(); });
          if (settings.width < 500 || settings.height < 300) throw new Error('Settings page did not fill the window: ' + JSON.stringify(settings));
          const generalNav = document.querySelector('[data-settings-section="general"]');
          generalNav.click();
          await new Promise(resolve => setTimeout(resolve, 40));
          const layout = document.querySelector('.vs-settingsLayout');
          const panel = document.querySelector('.vs-settingsPanel');
          const content = document.querySelector('.vs-settingsPageHead');
          const panelRect = panel.getBoundingClientRect();
          const contentRect = content.getBoundingClientRect();
          if (layout.scrollWidth > layout.clientWidth + 1 || panel.scrollWidth > panel.clientWidth + 1 || contentRect.left < panelRect.left - 1 || contentRect.right > panelRect.right + 1) {
            throw new Error('Settings content overflows at narrow width: ' + JSON.stringify({ layout: [layout.clientWidth, layout.scrollWidth], panel: [panel.clientWidth, panel.scrollWidth], content: [contentRect.left, contentRect.right], panelBounds: [panelRect.left, panelRect.right] }));
          }
          {
            const waitForThemePicker = (check, label) => new Promise((resolve, reject) => {
              const start = Date.now();
              const poll = () => {
                const value = check();
                if (value) resolve(value);
                else if (Date.now() - start > 5000) reject(new Error('Theme picker timed out waiting for ' + label));
                else setTimeout(poll, 25);
              };
              poll();
            });
            const nav = document.querySelector('[data-settings-section="appearance"]');
            if (!nav) throw new Error('Appearance settings are missing');
            nav.click();
            const picker = await waitForThemePicker(() => document.querySelector('.vs-themePicker'), 'picker control');
            const language = document.querySelector('[data-dropdown-select="language"]');
            language.querySelector('button').click();
            const languageMenu = await waitForThemePicker(() => {
              const element = language.querySelector('.vs-dropdownMenu');
              return element?.matches(':popover-open') ? element : null;
            }, 'language menu');
            const languageRect = languageMenu.getBoundingClientRect();
            if (languageRect.left < 8 || languageRect.top < 8 || languageRect.right > innerWidth - 8 || languageRect.bottom > innerHeight - 8 || languageMenu.querySelectorAll('[role="option"]').length !== 2) throw new Error('Language dropdown is clipped or incomplete');
            languageMenu.querySelector('[role="option"][aria-selected="true"]').click();
            await waitForThemePicker(() => !languageMenu.matches(':popover-open'), 'language menu close');
            const panel = document.querySelector('.vs-settingsPanel');
            const trigger = picker.querySelector('summary');
            panel.scrollTop += trigger.getBoundingClientRect().top - innerHeight + 140;
            await new Promise((resolve) => setTimeout(resolve, 40));
            trigger.click();
            const menu = await waitForThemePicker(() => {
              const element = document.querySelector('.vs-themePickerMenu');
              return element?.matches(':popover-open') ? element : null;
            }, 'popover open');
            const rect = menu.getBoundingClientRect();
            if (rect.left < 8 || rect.top < 8 || rect.right > innerWidth - 8 || rect.bottom > innerHeight - 8) {
              throw new Error('Theme picker escaped the window: ' + JSON.stringify({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight }));
            }
            if (Math.abs(rect.left - Math.max(12, Math.min(trigger.getBoundingClientRect().left, innerWidth - rect.width - 12))) > 2) throw new Error('Theme picker is not aligned with its control');
            const options = menu.querySelector('.vs-themePickerOptions');
            if (!options || options.clientHeight < 80 || options.scrollHeight <= options.clientHeight) throw new Error('Theme list is clipped instead of scrolling');
            if (rect.right > trigger.getBoundingClientRect().right + 1) throw new Error('Theme menu protrudes beyond its control');
            options.scrollTop = options.scrollHeight;
            await new Promise(resolve => setTimeout(resolve, 160));
            const afterScroll = menu.getBoundingClientRect();
            if (!menu.matches(':popover-open') || options.scrollTop === 0 || Math.abs(rect.top - afterScroll.top) > 1 || Math.abs(rect.left - afterScroll.left) > 1) throw new Error('Theme menu moved or closed while scrolling its list');
            menu.querySelector('.vs-themePickerOption.is-active')?.click();
            await waitForThemePicker(() => !menu.matches(':popover-open'), 'popover close');
          }
          const sections = [...document.querySelectorAll('.vs-settingsNavItem')];
          if (sections.length !== 34) throw new Error('Expected 34 settings sections, found ' + sections.length);
          for (const section of sections) {
            console.log('Smoke stage: settings ' + section.dataset.settingsSection);
            section.click();
            await new Promise(resolve => setTimeout(resolve, 40));
            if (!section.classList.contains('is-active') || !document.querySelector('.vs-settingsPanel h1')?.textContent.trim() || !document.querySelector('.vs-settingsPanelBody')) throw new Error('Settings section failed to render: ' + section.textContent.trim());
            if (section.dataset.settingsSection === 'input-editing') {
              const toggle = document.querySelector('.vs-settingsPanel [role="switch"]');
              const before = toggle.getAttribute('aria-checked') === 'true';
              toggle.click();
              await waitFor(() => toggle.getAttribute('aria-checked') === String(!before), 'input preference change');
              if (JSON.parse(localStorage.getItem('voxiva-terminal-prefs-v1')).rightClickPaste !== !before) throw new Error('Input preference was not persisted');
              toggle.click();
            }
            if (section.dataset.settingsSection === 'stats-usage') {
              const toggle = document.querySelector('.vs-settingsPanel [role="switch"]');
              const before = toggle.getAttribute('aria-checked') === 'true';
              toggle.click();
              await waitFor(() => toggle.getAttribute('aria-checked') === String(!before), 'status preference change');
              if (JSON.parse(localStorage.getItem('voxiva-status-bar-prefs-v1')).usage !== !before || Boolean(document.querySelector('.vs-statusUsageSummary')) !== !before) throw new Error('Usage preference did not update the status bar');
              toggle.click();
            }
            if (section.dataset.settingsSection === 'ssh') {
              const fill = (field, value) => { const input = document.querySelector('[data-ssh-field="' + field + '"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); };
              fill('name', 'Smoke host'); fill('host', '--invalid');
              await new Promise(resolve => setTimeout(resolve, 30));
              document.querySelector('.vs-settingsHostForm').requestSubmit();
              await waitFor(() => document.querySelector('.vs-settingsFormError'), 'SSH validation');
              fill('host', 'localhost');
              await new Promise(resolve => setTimeout(resolve, 30));
              document.querySelector('.vs-settingsHostForm').requestSubmit();
              const saved = await waitFor(() => document.querySelector('.vs-settingsConnectionList article'), 'saved SSH host');
              if (!JSON.parse(localStorage.getItem('voxiva-ssh-hosts-v1')).some(host => host.name === 'Smoke host' && host.host === 'localhost')) throw new Error('SSH host was not persisted');
              saved.querySelector('.vs-iconBtn').click();
              await waitFor(() => !document.querySelector('.vs-settingsConnectionList article'), 'removed SSH host');
            }
            if (section.dataset.settingsSection === 'mobile') {
              const toggle = await waitFor(() => { const button = document.querySelector('.vs-settingsPanel [role="switch"]'); return button && !button.disabled ? button : null; }, 'mobile status');
              const started = toggle.getAttribute('aria-checked') === 'true';
              if (!started) {
                toggle.click();
                await waitFor(() => document.querySelector('.vs-companionQr canvas'), 'mobile pairing QR');
                if (!(await window.voxiva.invoke('companion_status')).running) throw new Error('Mobile server did not start');
                await waitFor(() => !toggle.disabled, 'mobile switch ready');
                toggle.click();
                await waitFor(() => toggle.getAttribute('aria-checked') === 'false', 'mobile server stop');
                if ((await window.voxiva.invoke('companion_status')).running) throw new Error('Mobile server did not stop');
              }
            }
            if (section.dataset.settingsSection === 'voice') {
              const prefsKey = 'voxiva-voice-prefs-v1';
              const toggle = document.querySelector('.vs-voiceSettings [role="switch"]');
              const wasEnabled = toggle.getAttribute('aria-checked') === 'true';
              toggle.click();
              await waitFor(() => JSON.parse(localStorage.getItem(prefsKey)).enabled === !wasEnabled, 'voice enabled preference');
              const mode = document.querySelector('.vs-voiceSettings .vs-agentPermissionChoices button');
              mode.click();
              await waitFor(() => JSON.parse(localStorage.getItem(prefsKey)).mode === 'toggle', 'voice dictation mode');
              const model = document.querySelector('.vs-voiceModelSelect .vs-dropdownTrigger');
              model.click();
              const option = await waitFor(() => [...document.querySelectorAll('.vs-voiceModelSelect .vs-dropdownOption')].find(button => button.textContent.includes('Parakeet TDT v3')), 'voice model option');
              option.click();
              await waitFor(() => JSON.parse(localStorage.getItem(prefsKey)).model === 'parakeet-v3', 'voice model preference');
            }
            if (section.dataset.settingsSection === 'agents') {
              const choices = document.querySelector('.vs-agentDefaultChoices');
              if (!choices || !choices.querySelector('button[aria-pressed="true"]')) throw new Error('Default agent choices did not render');
              choices.querySelector('button').click();
              await waitFor(() => choices.querySelector('button')?.getAttribute('aria-pressed') === 'true', 'default agent choice');
              const awakeChoices = document.querySelector('.vs-agentPreferences .vs-agentPermissionChoices');
              awakeChoices.querySelectorAll('button')[1].click();
              await waitFor(() => localStorage.getItem('voxiva-awake-mode') === 'agents', 'awake preference');
              awakeChoices.querySelectorAll('button')[2].click();
              await waitFor(() => localStorage.getItem('voxiva-awake-mode') === 'off', 'awake preference restore');
              if (!document.querySelector('.vs-agentSettingsRow img, .vs-agentSettingsRow .vs-brandMark')) throw new Error('Agent icons did not render');
              const enabled = document.querySelector('.vs-agentAvailabilityChoices');
              if (enabled) {
                const [on, off] = enabled.querySelectorAll('button');
                const initial = on.getAttribute('aria-pressed') === 'true';
                (initial ? off : on).click();
                await waitFor(() => on.getAttribute('aria-pressed') === String(!initial), 'agent enable preference');
                (initial ? on : off).click();
                await waitFor(() => on.getAttribute('aria-pressed') === String(initial), 'agent enable restore');
              }
            }
            if (section.dataset.settingsSection === 'provider-accounts') {
              const names = [...document.querySelectorAll('.vs-providerTitle strong')].map((item) => item.textContent.trim());
              if (!['OpenCode', 'Devin', 'Claude', 'Codex', 'Gemini CLI', 'MiniMax', 'Cursor', 'GLM Coding Plan'].every((name) => names.includes(name))) throw new Error('Provider account sections are incomplete');
              if (!document.querySelector('.vs-providerAccountRow') || !document.querySelector('.vs-providerActions button')) throw new Error('Provider account actions did not render');
            }
            if (section.dataset.settingsSection === 'orchestration') {
              const depth = document.querySelector('#vs-orchestration-depth');
              if (!document.querySelector('.vs-orchestrationCard') || !document.querySelector('.vs-orchestrationAgents') || document.querySelectorAll('.vs-orchestrationAgents > span').length !== 4 || depth?.min !== '1' || depth.max !== '5' || depth.value !== '1') throw new Error('Orchestration controls or agent coverage did not render');
              if (!document.querySelector('.vs-orchestrationScenarioGrid .vs-orchestrationScenario') || !document.querySelector('.vs-orchestrationActions .vs-orchestrationPrimary')) throw new Error('Orchestration guidance or install action did not render');
            }
            if (section.dataset.settingsSection === 'terminal') {
              const duplicateTitle = [...document.querySelectorAll('.vs-terminalSettings h2')].some((heading) => heading.textContent.trim() === section.textContent.trim());
              if (duplicateTitle) throw new Error('Terminal settings repeat the page title');
              const shellChoices = document.querySelector('.vs-terminalSettingsGroup .vs-terminalRangeChoices');
              if (!shellChoices || [...shellChoices.querySelectorAll('button')].some((button) => button.scrollWidth > button.clientWidth + 1)) throw new Error('Terminal shell labels overflow their buttons');
            }
            if (section.dataset.settingsSection === 'hotkeys') {
              const terminalFirst = document.querySelector('[data-hotkey-priority="terminal"]');
              if (!terminalFirst || !document.querySelector('[data-hotkey-priority="voxiva"]')) throw new Error('Terminal shortcut priority control did not render');
              terminalFirst.click();
              await new Promise(resolve => setTimeout(resolve, 40));
              if (localStorage.getItem('voxiva-space-hotkey-priority-v1') !== 'terminal') throw new Error('Terminal shortcut priority was not saved');
              document.querySelector('[data-hotkey-priority="voxiva"]').click();
              const row = document.querySelector('.vs-hotkeyRows li');
              const clear = row?.querySelector('.vs-hotkeyClear');
              if (!row || !clear || !document.querySelector('.vs-hotkeySearch')) throw new Error('Shortcut manager controls did not render');
              const action = row.dataset.hotkeyAction;
              clear.click();
              await new Promise(resolve => setTimeout(resolve, 40));
              document.querySelector('[data-hotkey-filter="unassigned"]').click();
              await new Promise((resolve, reject) => { const start = Date.now(); const poll = () => { if (row.querySelector('.vs-hotkeyEdit.is-unassigned')) resolve(); else if (Date.now() - start > 5000) reject(new Error('Cleared shortcut was not shown in Unassigned')); else setTimeout(poll, 25); }; poll(); });
              row.querySelector('.vs-hotkeyEdit').click();
              await new Promise(resolve => setTimeout(resolve, 30));
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true, cancelable: true }));
              await new Promise(resolve => setTimeout(resolve, 30));
              document.querySelector('[data-hotkey-filter="all"]').click();
              await new Promise((resolve, reject) => { const start = Date.now(); const poll = () => { const reassigned = document.querySelector('[data-hotkey-action="' + action + '"] .vs-hotkeyEdit'); if (reassigned && !reassigned.classList.contains('is-unassigned') && reassigned.querySelector('kbd')) resolve(); else if (Date.now() - start > 5000) reject(new Error('Shortcut reassignment did not save')); else setTimeout(poll, 25); }; poll(); });
              document.querySelector('.vs-settingsPanelHead .vs-btn').click();
            }
          }
          const appearance = document.querySelector('[data-settings-section="appearance"]');
          appearance.click();
          await new Promise(resolve => setTimeout(resolve, 40));
          const language = document.querySelector('[data-dropdown-select="language"]');
          language.querySelector('button').click();
          await new Promise((resolve, reject) => { const start = Date.now(); const poll = () => { if (language.querySelector('.vs-dropdownMenu')?.matches(':popover-open')) resolve(); else if (Date.now() - start > 5000) reject(new Error('Language menu did not reopen for capture')); else setTimeout(poll, 25); }; poll(); });
          return true;
        })()`;
        new Function(statusScript);
        const status = await window.webContents.executeJavaScript(statusScript);
        if (!status) throw new Error("Status bar smoke failed");
        const settingsDropdownPreview = path.join(os.tmpdir(), "voxiva-settings-dropdown-smoke.png");
        await fs.writeFile(settingsDropdownPreview, (await window.webContents.capturePage()).toPNG());
        console.log(`Settings dropdown preview: ${settingsDropdownPreview}`);
        await window.webContents.executeJavaScript("document.querySelector('[data-dropdown-select=language] .vs-dropdownMenu')?.hidePopover(); document.querySelector('.vs-settingsBack')?.click(); new Promise(resolve => setTimeout(resolve, 40))");
        await window.webContents.executeJavaScript("document.querySelector('button[popovertarget=\"status-usage\"]').click(); new Promise(resolve => setTimeout(resolve, 100))");
        const usagePreview = path.join(os.tmpdir(), "voxiva-usage-smoke.png");
        await fs.writeFile(usagePreview, (await window.webContents.capturePage()).toPNG());
        await window.webContents.executeJavaScript("document.getElementById('status-usage').hidePopover()");
        console.log(`Usage preview: ${usagePreview}`);
        await window.webContents.executeJavaScript("document.querySelector('button[popovertarget=\"status-resources\"]').click(); new Promise(resolve => setTimeout(resolve, 40))");
        const resourceOpen = await window.webContents.executeJavaScript("document.getElementById('status-resources').matches(':popover-open')");
        if (!resourceOpen) throw new Error("Resource manager did not stay open for capture");
        const resourcePreview = path.join(os.tmpdir(), "voxiva-resource-smoke.png");
        await fs.writeFile(resourcePreview, (await window.webContents.capturePage()).toPNG());
        await window.webContents.executeJavaScript("document.getElementById('status-resources').hidePopover(); new Promise(resolve => setTimeout(resolve, 40))");
        console.log(`Resource manager preview: ${resourcePreview}`);
        await window.webContents.executeJavaScript(`document.querySelector('[data-view-trigger="settings"]').click()`);
        const settingsFrame = await window.webContents.executeJavaScript("new Promise((resolve,reject)=>{const start=Date.now();const poll=()=>{const page=document.querySelector('.vs-settingsLayout');const r=page?.getBoundingClientRect();const active=document.querySelector('.vs-root.is-settingsView');const button=document.querySelector('[data-view-trigger=\\\"settings\\\"]');if(active&&page&&r?.width>0&&r.height>0&&button?.getAttribute('aria-pressed')==='true')requestAnimationFrame(()=>requestAnimationFrame(()=>resolve({width:r.width,height:r.height})));else if(Date.now()-start>5000)reject(new Error('Settings is not active/visible: '+JSON.stringify({active:!!active,rect:r&&[r.width,r.height],pressed:button?.getAttribute('aria-pressed')})));else setTimeout(poll,25)};poll()})");
        if (settingsFrame.width < 500 || settingsFrame.height < 300) throw new Error(`Settings frame is too small: ${JSON.stringify(settingsFrame)}`);
        const settingsPreview = path.join(os.tmpdir(), "voxiva-settings-smoke.png");
        await fs.writeFile(settingsPreview, (await window.webContents.capturePage()).toPNG());
        console.log(`Settings preview: ${settingsPreview}`);
        await window.webContents.executeJavaScript("document.querySelector('[data-settings-section=agents]').click(); new Promise(resolve => setTimeout(resolve, 80))");
        const agentsPreview = path.join(os.tmpdir(), "voxiva-agents-settings-smoke.png");
        await fs.writeFile(agentsPreview, (await window.webContents.capturePage()).toPNG());
        console.log(`Agent settings preview: ${agentsPreview}`);
        window.setSize(760, 600);
        const fits = await window.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => {
          const bar = document.querySelector('.vs-statusBar');
          const rows = [...document.querySelectorAll('.vs-agentSettingsRowHead')];
          resolve(bar.scrollWidth <= bar.clientWidth && rows.every((row) => row.scrollWidth <= row.clientWidth + 1));
        }))`);
        if (!fits) throw new Error("Status bar or agent settings overflows at minimum window width");
        window.setSize(1240, 780);
        let [viewportWidth, viewportHeight] = [0, 0];
        let windowBounds;
        for (let attempt = 0; attempt < 40; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 50));
          [viewportWidth, viewportHeight] = await window.webContents.executeJavaScript("[innerWidth, innerHeight]");
          windowBounds = window.getContentBounds();
          if (Math.abs(viewportWidth - windowBounds.width) <= 1 && Math.abs(viewportHeight - windowBounds.height) <= 1) break;
        }
        if (Math.abs(viewportWidth - windowBounds.width) > 1 || Math.abs(viewportHeight - windowBounds.height) > 1) throw new Error("Renderer viewport did not resize with the window");
        await window.webContents.executeJavaScript("new Promise((resolve, reject) => { document.querySelector('[data-settings-section=provider-accounts]').click(); const start = Date.now(); const poll = () => document.querySelector('.vs-providerAccounts') ? resolve() : Date.now() - start > 5000 ? reject(new Error('Provider accounts page did not open')) : setTimeout(poll, 25); poll(); })");
        const providerPreview = path.join(os.tmpdir(), "voxiva-provider-accounts-smoke.png");
        await fs.writeFile(providerPreview, (await window.webContents.capturePage()).toPNG());
        console.log(`Provider accounts preview: ${providerPreview}`);
        window.setSize(760, 600);
        const providerFits = await window.webContents.executeJavaScript("new Promise(resolve => requestAnimationFrame(() => { const page = document.querySelector('.vs-providerAccounts'); resolve(page && page.scrollWidth <= page.clientWidth + 1); }))");
        if (!providerFits) throw new Error("Provider accounts overflows at minimum window width");
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
