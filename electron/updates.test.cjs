const test = require("node:test");
const assert = require("node:assert/strict");
const { createUpdates } = require("./updates.cjs");

test("Electron updates require packaged metadata before install", async () => {
  let installed = false;
  const updater = {
    checkForUpdates: async () => ({ updateInfo: { version: "0.2.5", releaseNotes: "Fixes" } }),
    downloadUpdate: async () => {},
    quitAndInstall: () => { installed = true; },
  };
  const updates = createUpdates({ isPackaged: true, getVersion: () => "0.2.4" }, updater);
  await assert.rejects(updates.install());
  assert.equal((await updates.check()).latestVersion, "0.2.5");
  assert.equal(updater.autoDownload, false);
  await updates.install();
  assert.equal(installed, true);
  assert.equal((await createUpdates({ isPackaged: false, getVersion: () => "0.2.4" }, updater).check()).updateAvailable, false);
});
