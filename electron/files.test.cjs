const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { files, findComponentFiles } = require("./files.cjs");

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

test("component search finds matching files without scanning ignored directories", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "voxiva-components-test-"));
  try {
    await fs.writeFile(path.join(root, "Card.tsx"), "export const Card = () => <div className='card-shell'>Hello</div>");
    await fs.mkdir(path.join(root, "node_modules"));
    await fs.writeFile(path.join(root, "node_modules", "Wrong.tsx"), "Card card-shell Hello");
    assert.deepEqual(await findComponentFiles({ workspaceRoot: root, component: "Card", classes: ["card-shell"], text: "Hello" }), ["Card.tsx"]);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
