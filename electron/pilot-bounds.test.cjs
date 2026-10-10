const { test } = require("node:test");
const assert = require("node:assert/strict");
const { bounds } = require("./pilot-bounds.cjs");

test("clips a pane to the window without negative size", () => {
  assert.deepEqual(bounds({ x: 700, y: 50, width: 400, height: 900 }, { width: 1000, height: 600 }), {
    x: 700, y: 50, width: 300, height: 550,
  });
  assert.deepEqual(bounds({ x: 1200, y: 0, width: 200, height: 200 }, { width: 1000, height: 600 }), {
    x: 1000, y: 0, width: 0, height: 200,
  });
});

test("rejects malformed geometry", () => {
  assert.throws(() => bounds({ x: 1, y: 1, width: NaN, height: 10 }, { width: 100, height: 100 }));
});
