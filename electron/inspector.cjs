const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(path.join(__dirname, "..", "src-tauri", "src", "inspector", "inject.js"), "utf8");
const version = Number(script.match(/const VERSION = (\d+);/)?.[1]);
if (!version) throw new Error("Invalid browser inspector script");
const WORLD = 1001;
const run = (view, code) => view.webContents.executeJavaScriptInIsolatedWorld(WORLD, [{ code }]);

async function ensure(view) {
  if (await run(view, `Boolean(window.__voxivaInspector?.v === ${version})`)) return;
  await run(view, script);
  if (!await run(view, `Boolean(window.__voxivaInspector?.v === ${version})`)) throw new Error("Browser inspector did not load");
}

async function command(view, name, args = {}) {
  if (name === "browser_toggle_inspector") {
    if (!args.enabled) {
      await run(view, "window.__voxivaInspector?.forceOff?.(); true");
      return true;
    }
    await ensure(view);
    return Boolean(await run(view, "window.__voxivaInspector.setEnabled(true); Boolean(window.__voxivaInspector.enabled)"));
  }
  if (name === "browser_take_selection") {
    const result = await run(view, "window.__voxivaInspector?.takeEvent?.() ?? null");
    if (JSON.stringify(result).length > 250_000) throw new Error("Selected element context is too large");
    return result;
  }
  if (name === "browser_inspector_snapshot") {
    await ensure(view);
    return run(view, "window.__voxivaInspector?.snapshot?.() ?? { enabled: false, selections: [] }");
  }
  if (name === "browser_configure_inspector") {
    await ensure(view);
    await run(view, `window.__voxivaInspector.configure(${JSON.stringify(args.agents || [])}, ${JSON.stringify(args.files || [])})`);
    return;
  }
  throw new Error("Unknown inspector command");
}

module.exports = { command };
