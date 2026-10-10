const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { scan } = require("./vault.cjs");

test("vault finds and filters local agent sessions", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "voxiva-vault-test-"));
  try {
    const dir = path.join(home, ".claude", "projects", "C--work-repo");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "abc.jsonl"), JSON.stringify({ message: { content: "Fix the browser" } }) + "\n");
    const result = await scan({ query: "browser", limit: 10 }, home);
    assert.equal(result.length, 1);
    assert.equal(result[0].agentId, "claude");
    assert.equal(result[0].resumeCommand, "claude --resume abc");
    assert.equal((await scan({ query: "unmatched" }, home)).length, 0);
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});
