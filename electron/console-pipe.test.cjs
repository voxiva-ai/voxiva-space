const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { ignoreBrokenPipe } = require("./console-pipe.cjs");

test("closed console pipes do not crash the Electron main process", () => {
  const stream = new EventEmitter();
  ignoreBrokenPipe(stream);
  assert.doesNotThrow(() => stream.emit("error", Object.assign(new Error("closed"), { code: "EPIPE" })));
  const failure = Object.assign(new Error("disk full"), { code: "ENOSPC" });
  assert.throws(() => stream.emit("error", failure), (error) => error === failure);
});
