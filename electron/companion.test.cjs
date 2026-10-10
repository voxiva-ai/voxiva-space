const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createCompanion } = require("./companion.cjs");

test("companion pairs over loopback without exposing its token to unauthenticated clients", async () => {
  const events = [];
  const companion = createCompanion((name, payload) => events.push({ name, payload }), 0, "127.0.0.1");
  const token = "local-test-token-123456";
  try {
    const status = await companion.start(token, "workspace-1");
    const base = `http://127.0.0.1:${status.port}`;
    const publicStatus = await (await fetch(`${base}/api/status`)).json();
    assert.equal(JSON.stringify(publicStatus).includes(token), false);
    assert.equal((await fetch(`${base}/api/snapshot`)).status, 401);
    const paired = await fetch(`${base}/api/pair`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    assert.equal(paired.status, 200);
    companion.pushSnapshot({ spaces: [{ id: "workspace-1" }], sessions: [], boards: {} });
    const snap = await fetch(`${base}/api/snapshot`, { headers: { "X-Voxiva-Token": token } });
    assert.equal((await snap.json()).spaces[0].id, "workspace-1");
    assert.equal(events[0].name, "companion://paired");
  } finally { await companion.stop(); }
});
