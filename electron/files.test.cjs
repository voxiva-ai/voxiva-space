const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { files } = require("./files.cjs");

test("workspace files stay within their root", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "voxiva-files-test-"));
  try {
    const args = { workspaceRoot: root, relativePath: "notes/a.txt" };
    await files("write_text_file", { ...args, content: "hello" });
    assert.equal((await files("read_text_file", args)).content, "hello");
    assert.equal((await files("list_workspace_dir", { workspaceRoot: root, relativePath: "notes" }))[0].name, "a.txt");
    await assert.rejects(files("write_text_file", { ...args, relativePath: "../outside.txt", content: "no" }));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
