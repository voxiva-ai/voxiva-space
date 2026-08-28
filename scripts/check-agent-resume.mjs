/**
 * Checks for agent drag → resume command wiring.
 * Run: node scripts/check-agent-resume.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const botsSrc = readFileSync(join(root, "src/features/agents/bots.ts"), "utf8");
const dragSrc = readFileSync(join(root, "src/features/agents/drag.ts"), "utf8");
const ctxSrc = readFileSync(join(root, "src/features/workspace/SpaceContext.tsx"), "utf8");
const gridSrc = readFileSync(join(root, "src/features/workspace/SplitGrid.tsx"), "utf8");
const historySrc = readFileSync(join(root, "src/components/shell/AgentHistoryPanel.tsx"), "utf8");
const overlaySrc = readFileSync(join(root, "src/features/workspace/paneDropOverlay.ts"), "utf8");

function resumeCommandFor(botId, raw, resolved) {
  const base = (resolved || raw || "").trim().split(/\s+/)[0];
  if (!base) return undefined;
  switch (botId) {
    case "opencode":
      return `${base} --continue`;
    case "claude":
      return `${base} --continue`;
    case "codex":
      return `${base} resume --last`;
    case "gemini":
      return `${base} -r "latest"`;
    case "aider":
      return `${base} --restore-chat-history`;
    case "goose":
      return `${base} session --resume`;
    case "cursor-agent":
      return `${base} --continue`;
    case "amp":
      return "amp threads continue";
    default:
      return resolved || raw || base;
  }
}

assert.equal(resumeCommandFor("opencode", "opencode", "opencode"), "opencode --continue");
assert.equal(resumeCommandFor("codex", "codex", "codex"), "codex resume --last");

assert.match(botsSrc, /case "opencode":\s*return `\$\{base\} --continue`/);
assert.match(dragSrc, /beginAgentDragSession/);
assert.match(historySrc, /resolveDropTargetAt/);
assert.match(historySrc, /resumeAgentRunAtDrop/);
assert.match(historySrc, /vs-historyDragGhost|ensureDragGhost/);
assert.match(overlaySrc, /dropZoneAt/);
assert.match(overlaySrc, /elementsFromPoint/);
assert.match(overlaySrc, /center → add beside as a tab|add beside as a tab/);

assert.match(ctxSrc, /holdEmptyPaneSpawn/);
assert.match(ctxSrc, /forceNew: true/);
assert.doesNotMatch(
  ctxSrc.slice(ctxSrc.indexOf("const resumeAgentRun"), ctxSrc.indexOf("const resumeAgentRunAtDrop")),
  /killTerminalSession/,
);

assert.match(gridSrc, /resumeAgentRunAtDrop\(run, paneId, zone\)/);

function dropZoneAt(rect, clientX, clientY) {
  const rx = (clientX - rect.left) / Math.max(1, rect.width);
  const ry = (clientY - rect.top) / Math.max(1, rect.height);
  const dx = rx - 0.5;
  const dy = ry - 0.5;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx < 0.22 && absDy < 0.22) return "center";
  if (absDx >= absDy) return dx < 0 ? "left" : "right";
  return dy < 0 ? "top" : "bottom";
}
const rect = { left: 0, top: 0, width: 100, height: 100 };
assert.equal(dropZoneAt(rect, 50, 50), "center");
assert.equal(dropZoneAt(rect, 15, 50), "left");
assert.equal(dropZoneAt(rect, 85, 50), "right");
assert.equal(dropZoneAt(rect, 50, 10), "top");

console.log("check-agent-resume: all assertions passed");
