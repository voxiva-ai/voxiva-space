const { test } = require("node:test");
const assert = require("node:assert/strict");
const { captureBeforeHide } = require("./view-visibility.cjs");

test("a delayed capture cannot hide a reopened browser", async () => {
  let finishCapture;
  const view = { visibilityVersion: 1, webContents: { capturePage: () => new Promise((resolve) => { finishCapture = resolve; }) } };
  const emitted = [];
  const hidden = [];
  const pending = captureBeforeHide(view, (data) => emitted.push(data), (item) => hidden.push(item));
  view.visibilityVersion += 1;
  finishCapture({ isEmpty: () => false, toDataURL: () => "snapshot" });
  await pending;
  assert.deepEqual(emitted, []);
  assert.deepEqual(hidden, []);
});

test("a stable browser is replaced by its snapshot while a menu is open", async () => {
  const view = { visibilityVersion: 1, webContents: { capturePage: async () => ({ isEmpty: () => false, toDataURL: () => "snapshot" }) } };
  let emitted = "";
  let hidden = false;
  await captureBeforeHide(view, (data) => { emitted = data; }, () => { hidden = true; });
  assert.equal(emitted, "snapshot");
  assert.equal(hidden, true);
});
