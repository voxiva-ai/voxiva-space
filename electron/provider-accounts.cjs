const fs = require("node:fs/promises");
const path = require("node:path");

const providers = new Set(["opencode-go", "minimax", "glm"]);

function createProviderAccounts(storage, file, request = fetch) {
  const read = async () => {
    try { return JSON.parse(await fs.readFile(file, "utf8")); }
    catch (error) { if (error.code === "ENOENT") return {}; throw error; }
  };
  const write = async (data) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(data), { mode: 0o600 });
    await fs.rename(temp, file);
  };
  const check = (id) => { if (!providers.has(id)) throw new Error("Unsupported provider"); };
  return {
    async list() {
      const data = await read();
      return [...providers].map((id) => ({ id, saved: typeof data[id] === "string" }));
    },
    async save(id, secret) {
      check(id);
      if (!storage.isEncryptionAvailable()) throw new Error("Secure credential storage is unavailable");
      if (typeof secret !== "string" || secret.trim().length < 8 || secret.length > 8192) throw new Error("Enter a valid API key");
      const data = await read();
      data[id] = storage.encryptString(secret.trim()).toString("base64");
      await write(data);
      return { id, saved: true };
    },
    async remove(id) {
      check(id);
      const data = await read();
      delete data[id];
      await write(data);
      return { id, saved: false };
    },
    async usage(id) {
      check(id);
      const encoded = (await read())[id];
      if (!encoded) throw new Error("Save an API key first");
      if (!storage.isEncryptionAvailable()) throw new Error("Secure credential storage is unavailable");
      const key = storage.decryptString(Buffer.from(encoded, "base64"));
      const url = id === "minimax" ? "https://www.minimax.io/v1/token_plan/remains" : id === "opencode-go" ? "https://opencode.ai/zen/go/v1/models" : null;
      if (!url) throw new Error("Usage data is not available for this provider");
      const response = await request(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(10_000) });
      const body = await response.text();
      if (body.length > 1_000_000) throw new Error("Provider response is too large");
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "API key was rejected" : `Provider request failed (${response.status})`);
      const payload = JSON.parse(body);
      if (id === "opencode-go") {
        const models = Array.isArray(payload) ? payload : Array.isArray(payload.data) ? payload.data : [];
        if (!models.length) throw new Error("OpenCode returned no model catalog");
        return { id, modelCount: models.length, updatedAt: Date.now() };
      }
      if (payload.base_resp?.status_code != null && Number(payload.base_resp.status_code) !== 0) throw new Error("MiniMax rejected this key; use a Token Plan subscription key");
      const data = payload.data || payload;
      const windows = [
        ["5h", data.current_interval_remaining_percent],
        ["week", data.current_weekly_remaining_percent],
      ].filter(([, remaining]) => Number.isFinite(remaining) && remaining >= 0 && remaining <= 100)
        .map(([label, remaining]) => ({ label, used: 100 - remaining }));
      const modelCount = Array.isArray(data.model_remains) ? data.model_remains.length : null;
      if (!windows.length && modelCount === null) throw new Error("MiniMax returned an unsupported quota format");
      return { id, windows, modelCount, updatedAt: Date.now() };
    },
  };
}

module.exports = { createProviderAccounts };
