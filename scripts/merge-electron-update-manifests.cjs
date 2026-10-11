const fs = require("node:fs");
const yaml = require("js-yaml");

function mergeManifests(manifests) {
  if (manifests.length < 2) throw new Error("At least two update manifests are required");
  const version = manifests[0].version;
  if (!version || manifests.some((manifest) => manifest.version !== version)) {
    throw new Error("Update manifest versions do not match");
  }
  const files = manifests.flatMap((manifest) => manifest.files || []);
  if (!files.length || files.some((file) => typeof file.url !== "string" || !file.sha512)) {
    throw new Error("Update manifests contain invalid file entries");
  }
  if (new Set(files.map((file) => file.url)).size !== files.length) {
    throw new Error("Update manifests contain duplicate files");
  }
  return { ...manifests[0], files };
}

if (require.main === module) {
  const [outputPath, ...inputPaths] = process.argv.slice(2);
  if (!outputPath || inputPaths.length < 2) throw new Error("Usage: node merge-electron-update-manifests.cjs <output> <manifest> <manifest> [...]");
  const merged = mergeManifests(inputPaths.map((file) => yaml.load(fs.readFileSync(file, "utf8"))));
  fs.writeFileSync(outputPath, yaml.dump(merged, { lineWidth: -1 }));
}

module.exports = { mergeManifests };
