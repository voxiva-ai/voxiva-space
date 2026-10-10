const path = require("node:path");
const { app, BrowserWindow, WebContentsView, ipcMain, Menu, shell } = require("electron");
const { bounds } = require("./pilot-bounds.cjs");

app.whenReady().then(() => {
  const smoke = process.argv.includes("--smoke");
  const window = new BrowserWindow({
    show: !smoke,
    width: 1200,
    height: 760,
    minWidth: 700,
    minHeight: 450,
    backgroundColor: "#10151d",
    webPreferences: {
      preload: path.join(__dirname, "pilot-preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const views = new Map();

  if (smoke) {
    const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    window.contentView.addChildView(view);
    view.setBounds(bounds({ x: 0, y: 0, width: 400, height: 300 }, window.getContentBounds()));
    void view.webContents.loadURL("data:text/html,<title>Chromium smoke</title>")
      .then(() => {
        if (view.webContents.getTitle() !== "Chromium smoke") throw new Error("Chromium view failed to load");
        console.log("Electron BrowserWindow and WebContentsView passed");
        app.exit(0);
      })
      .catch((error) => {
        console.error(error);
        app.exit(1);
      });
    return;
  }

  ipcMain.handle("pilot:open", async (event, label, rawUrl) => {
    if (event.sender !== window.webContents || !["left", "right"].includes(label)) throw new Error("Invalid pane");
    const url = new URL(rawUrl);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP(S) is supported");
    let view = views.get(label);
    if (!view) {
      view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
      view.webContents.setWindowOpenHandler(({ url: target }) => {
        if (/^https?:\/\//i.test(target)) void shell.openExternal(target);
        return { action: "deny" };
      });
      view.webContents.on("context-menu", (_, params) => {
        Menu.buildFromTemplate([
          { label: "Back", enabled: view.webContents.navigationHistory.canGoBack(), click: () => view.webContents.navigationHistory.goBack() },
          { label: "Reload", click: () => view.webContents.reload() },
          { type: "separator" },
          { role: "copy", enabled: Boolean(params.selectionText) },
        ]).popup({ window });
      });
      view.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      window.contentView.addChildView(view);
      views.set(label, view);
    }
    await view.webContents.loadURL(url.href);
  });

  ipcMain.handle("pilot:layout", (event, panes) => {
    if (event.sender !== window.webContents || !Array.isArray(panes)) throw new Error("Invalid layout");
    const area = window.getContentBounds();
    for (const pane of panes) {
      if (!["left", "right"].includes(pane.label)) throw new Error("Invalid pane");
      const view = views.get(pane.label);
      if (view) view.setBounds(bounds(pane, area));
    }
  });

  window.on("closed", () => {
    ipcMain.removeHandler("pilot:open");
    ipcMain.removeHandler("pilot:layout");
    for (const view of views.values()) view.webContents.close();
  });
  void window.loadFile(path.join(__dirname, "pilot.html"));
});

app.on("window-all-closed", () => app.quit());
