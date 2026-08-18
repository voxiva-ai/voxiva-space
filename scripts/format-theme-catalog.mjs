import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catPath = path.join(root, "src/features/theme/catalog.generated.ts");

const src = fs.readFileSync(catPath, "utf8");

// ── 1. Split into header / array / footer ──────────────────────
const arrayStart = src.indexOf("export const THEME_CATALOG");
const arrayEndRaw = src.indexOf("\n];", arrayStart);
const arrayEnd = arrayEndRaw + 3; // after "\n];"

const header = src.slice(0, arrayStart).trimEnd();
const footer = src.slice(arrayEnd).trimStart();

// Find "= [" — the actual array literal start (skip the type annotation `ThemeDefinition[]`)
const eqBracket = src.indexOf("= [", arrayStart);
const bracketStart = eqBracket + 2; // position of "["
const bracketEnd = src.lastIndexOf("]", arrayEnd) + 1; // last "]" before footer
let jsonArr = src.slice(bracketStart, bracketEnd);
// Remove trailing commas before ] or } (valid TS, invalid JSON)
jsonArr = jsonArr.replace(/,\s*([}\]])/g, "$1");

const entries = JSON.parse(jsonArr);

// ── 2. Group by familyId (preserve insertion order) ────────────
const families = new Map();
for (const entry of entries) {
  const key = entry.familyId;
  if (!families.has(key)) families.set(key, []);
  families.get(key).push(entry);
}

// ── 3. Emit structured catalog ─────────────────────────────────
function emitEntry(entry) {
  return "  " + JSON.stringify(entry, null, 2).replace(/\n/g, "\n  ") + ",\n";
}

function sectionBanner(label, variantCount) {
  if (variantCount > 1) {
    return (
      `\n  /* ═══════════════════════════════════════════\n` +
      `   * ${label}  ·  ${variantCount} variants\n` +
      `   * ═══════════════════════════════════════════ */\n`
    );
  }
  return `\n  /* ── ${label} ── */\n`;
}

let out = header + "\n\n";
out += "export const THEME_CATALOG: ThemeDefinition[] = [\n";

for (const [familyId, famEntries] of families) {
  const label = famEntries[0].label;
  out += sectionBanner(label, famEntries.length);
  for (const entry of famEntries) {
    out += emitEntry(entry);
  }
}

out += "];\n";
out += "\n" + footer;

fs.writeFileSync(catPath, out);
console.log(`Restructured: ${families.size} families, ${entries.length} themes`);
