const { test } = require("node:test");
const assert = require("node:assert/strict");
const { folderQueryValue, folderUrl } = require("./vscode.cjs");

test("VS Code serve-web folder URL keeps an absolute remote path", () => {
  assert.equal(folderQueryValue("C:\\Users\\Me\\repo"), "/C:/Users/Me/repo");
  assert.equal(folderQueryValue("/Users/me/repo"), "/Users/me/repo");
});

test("VS Code rejects an empty folder before launching a server", async () => {
  await assert.rejects(folderUrl(""), /empty/);
});
