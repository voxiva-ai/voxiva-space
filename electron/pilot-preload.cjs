const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pilot", {
  open: (label, url) => ipcRenderer.invoke("pilot:open", label, url),
  layout: (panes) => ipcRenderer.invoke("pilot:layout", panes),
});
