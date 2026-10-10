const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("voxiva", {
  invoke: (command, args) => ipcRenderer.invoke("voxiva:invoke", command, args),
  listen: (name, callback) => {
    const handler = (_event, eventName, payload) => { if (eventName === name) callback(payload); };
    ipcRenderer.on("voxiva:event", handler);
    return () => ipcRenderer.removeListener("voxiva:event", handler);
  },
});
window.addEventListener("DOMContentLoaded", () => document.documentElement.dataset.electron = "true");
