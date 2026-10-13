const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createProviderAccounts } = require("./provider-accounts.cjs");

test("provider secrets are encrypted at rest and never returned by list", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "voxiva-accounts-"));
  const file = path.join(dir, "accounts.json");
  const api = createProviderAccounts({ isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(`encrypted:${value}`), decryptString: (value) => value.toString().replace("encrypted:", "") }, file);
  try {
    await api.save("minimax", "  secret-key-123  ");
    assert.deepEqual(await api.list(), ["opencode-go", "minimax", "glm"].map((id) => ({ id, saved: id === "minimax" })));
    assert.equal((await fs.readFile(file, "utf8")).includes("secret-key-123"), false);
    await api.remove("minimax");
    assert.equal((await api.list()).find((row) => row.id === "minimax").saved, false);
    await assert.rejects(api.save("unknown", "secret-key-123"), /Unsupported provider/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("provider usage queries only return quota and model counts", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "voxiva-usage-"));
  const storage = { isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(`encrypted:${value}`), decryptString: (value) => value.toString().replace("encrypted:", "") };
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, authorization: options.headers.Authorization });
    return new Response(JSON.stringify({ current_interval_remaining_percent: 72, current_weekly_remaining_percent: 41, model_remains: [{}, {}] }));
  };
  const api = createProviderAccounts(storage, path.join(dir, "accounts.json"), request);
  try {
    await api.save("minimax", "minimax-key-123");
    const usage = await api.usage("minimax");
    assert.deepEqual({ ...usage, updatedAt: 0 }, { id: "minimax", windows: [{ label: "5h", used: 28 }, { label: "week", used: 59 }], modelCount: 2, updatedAt: 0 });
    assert.ok(usage.updatedAt > 0);
    assert.equal(calls[0].url, "https://www.minimax.io/v1/token_plan/remains");
    assert.equal(calls[0].authorization, "Bearer minimax-key-123");
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
