const assert = require("node:assert/strict");
const { parseCodexSubscription, parseLimits, parsePorts, formatResourceMetrics, createAwake } = require("./status.cjs");
const subscriptionAuth = (plan) => ({ auth_mode: "chatgpt", tokens: { id_token: `header.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_plan_type: plan } })).toString("base64url")}.signature` } });
assert.deepEqual(parseCodexSubscription(subscriptionAuth("plus")), { provider: "codex", plan: "plus" });
assert.equal(parseCodexSubscription(subscriptionAuth("free")), null);
assert.equal(parseCodexSubscription(subscriptionAuth("unknown")), null);
assert.equal(parseCodexSubscription({ auth_mode: "apikey" }), null);
assert.equal(parseCodexSubscription({ auth_mode: "chatgpt", tokens: { id_token: "broken" } }), null);
assert.equal(parseCodexSubscription(null), null);
const row = (at, used = 35) => JSON.stringify({ timestamp: at, type: "event_msg", payload: { type: "token_count", rate_limits: { primary: { used_percent: used, window_minutes: 300, resets_at: 1800000000 } } } });
assert.equal(parseLimits("broken\n" + row("2026-10-11T10:00:00Z") + "\n{unfinished").windows[0].used, 35);
assert.equal(parseLimits(row("2026-10-11T11:00:00Z", 40) + "\n" + row("2026-10-11T10:00:00Z")).windows[0].used, 40);
assert.equal(parseLimits(row("invalid")), null);
assert.equal(parseLimits(row("2026-10-11T10:00:00Z", 101)), null);
assert.equal(parseLimits(row("2026-10-11T10:00:00Z", "35")), null);
assert.deepEqual(parsePorts(" TCP 0.0.0.0:5173 0.0.0.0:0 LISTENING 42\n TCP [::]:5173 [::]:0 LISTENING 42\n TCP 127.0.0.1:99 127.0.0.1:22 ESTABLISHED 4\n TCP 0.0.0.0:99999 0.0.0.0:0 LISTENING 9"), [{ port: 5173, pid: 42, host: "127.0.0.1" }]);
assert.equal(parsePorts("TCP [::]:3000 [::]:0 LISTENING 4")[0].host, "[::1]");
assert.deepEqual(formatResourceMetrics([
  { pid: 2, type: "Tab", cpu: { percentCPUUsage: 4.25 }, memory: { workingSetSize: 2048 } },
  { pid: 1, type: "Browser", cpu: { percentCPUUsage: 1 }, memory: { workingSetSize: 1024 } },
  { pid: 3, type: "Utility", cpu: { percentCPUUsage: -0.2 }, memory: { workingSetSize: 1024 } },
], 8 * 1024 ** 3, 3 * 1024 ** 3), {
  memoryMb: 4,
  processes: [
    { pid: 2, name: "Renderer", cpu: 4.3, memoryMb: 2 },
    { pid: 1, name: "Browser", cpu: 1, memoryMb: 1 },
    { pid: 3, name: "Utility", cpu: 0, memoryMb: 1 },
  ],
  systemMemoryMb: 8192,
  freeSystemMemoryMb: 3072,
});
const calls = [];
const awake = createAwake({ start: (kind) => { calls.push(kind); return 0; }, stop: (id) => calls.push(id) });
assert.equal(awake.set("agents", false), false);
assert.equal(awake.set("agents", true), true);
awake.set("on", true);
assert.deepEqual(calls, ["prevent-app-suspension"]);
awake.set("off", true);
assert.deepEqual(calls, ["prevent-app-suspension", 0]);
assert.throws(() => awake.set("invalid", false));
assert.throws(() => awake.set("on", "true"));
awake.set("on", false);
awake.stop();
assert.equal(calls.length, 4);
console.log("Status tests passed");
