const { test } = require("node:test");
const assert = require("node:assert/strict");
const { details, importCookies } = require("./cookies.cjs");

test("cookie import writes only valid domain-matched cookies", async () => {
  const written = [];
  const store = { cookies: { set: async (item) => written.push(item), flushStore: async () => {} } };
  const read = async () => [
    { name: "sid", value: "secret", domain: ".github.com", path: "/", secure: true, httpOnly: true, expires: null },
    { name: "bad", value: "secret", domain: "wrong.example", path: "/" },
    { name: "bad", value: "secret", domain: "evil/site", path: "/" },
  ];
  const result = await importCookies(read, store, { from: "chrome", domains: ["github.com"] });
  assert.deepEqual(result, { imported: 1, skipped: 2, source: "chrome" });
  assert.equal(written[0].url, "https://github.com/");
  assert.equal(written[0].httpOnly, true);
  assert.equal(details({ name: "x", value: "v", domain: "evil/site" }), null);
});
