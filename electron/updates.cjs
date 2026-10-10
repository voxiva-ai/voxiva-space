function createUpdates(app, updater) {
  const currentVersion = app.getVersion();
  let available = null;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  const downloadsPage = "https://github.com/voxiva-ai/voxiva-space/releases";

  return {
    async check() {
      if (!app.isPackaged) return { currentVersion, latestVersion: currentVersion, updateAvailable: false, notes: "", downloadUrl: "", downloadsPage };
      const result = await updater.checkForUpdates();
      available = result?.updateInfo?.version !== currentVersion ? result?.updateInfo : null;
      const latestVersion = available?.version || currentVersion;
      return {
        currentVersion, latestVersion, updateAvailable: Boolean(available),
        notes: typeof available?.releaseNotes === "string" ? available.releaseNotes.slice(0, 280) : "",
        downloadUrl: available ? "electron-update" : "", downloadsPage,
      };
    },
    async install() {
      if (!app.isPackaged || !available) throw new Error("No Electron update has been checked");
      await updater.downloadUpdate();
      updater.quitAndInstall(false, true);
    },
  };
}

module.exports = { createUpdates };
