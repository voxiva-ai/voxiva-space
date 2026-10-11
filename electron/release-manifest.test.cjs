const test = require("node:test");
const assert = require("node:assert/strict");
const { mergeManifests } = require("../scripts/merge-electron-update-manifests.cjs");

test("mac update manifest includes both CPU architectures", () => {
  const merged = mergeManifests([
    { version: "0.2.5", files: [{ url: "space-mac-arm64.zip", sha512: "arm", size: 10 }] },
    { version: "0.2.5", files: [{ url: "space-mac-x64.zip", sha512: "intel", size: 11 }] },
  ]);
  assert.deepEqual(merged.files.map((file) => file.url), ["space-mac-arm64.zip", "space-mac-x64.zip"]);
});

test("refuses mixed versions and duplicate update assets", () => {
  const manifest = { version: "0.2.5", files: [{ url: "space.zip", sha512: "hash" }] };
  assert.throws(() => mergeManifests([manifest, { ...manifest, version: "0.2.6" }]), /versions do not match/);
  assert.throws(() => mergeManifests([manifest, manifest]), /duplicate files/);
});
