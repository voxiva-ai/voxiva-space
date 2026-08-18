import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(root, "src/features/theme/catalog.generated.ts"), "utf8");

const i = src.indexOf("= [");
const arrStart = src.indexOf("[", i);
// Find matching ] by bracket counting
let depth = 0;
let arrEnd = arrStart;
for (let k = arrStart; k < src.length; k++) {
  if (src[k] === "[") depth++;
  if (src[k] === "]") depth--;
  if (depth === 0) { arrEnd = k; break; }
}
let jarr = src.slice(arrStart, arrEnd + 1);
// Strip JS block comments (/* ... */) which are not valid JSON
jarr = jarr.replace(/\/\*[\s\S]*?\*\//g, "");
// Remove trailing commas
jarr = jarr.replace(/,\s*([}\]])/g, "$1");
const entries = JSON.parse(jarr);

function hex2rgb(h) {
  h = h.replace("#", "");
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function lum(r,g,b) {
  const lin = v => { v/=255; return v<=0.03928 ? v/12.92 : ((v+0.055)/1.055)**2.4; };
  return 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b);
}
function contrast(a,b) {
  const l1 = lum(...hex2rgb(a)), l2 = lum(...hex2rgb(b));
  return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
}
function isGreenish(hex) { const [r,g,b]=hex2rgb(hex); return g>r+10 && g>b+10; }
function isReddish(hex) { const [r,g,b]=hex2rgb(hex); return r>g+10 && r>b+10; }

let issues = [];
let pass = [];
for (const t of entries) {
  const tk = t.tokens;
  const an = t.ansi;
  const tc = contrast(tk.termFg, tk.termBg);
  const ac = contrast(tk.accent, tk.bg);
  const line = [];
  if (tc < 3.0) line.push(`term contrast ${tc.toFixed(1)}`);
  if (ac < 2.5) line.push(`accent contrast ${ac.toFixed(1)}`);
  if (!isGreenish(an.green)) line.push(`ansi.green=${an.green} not green`);
  if (!isGreenish(an.brightGreen)) line.push(`ansi.brightGreen=${an.brightGreen} not green`);
  if (!isReddish(an.red)) line.push(`ansi.red=${an.red} not red`);
  if (line.length) issues.push(`  ⚠ ${t.id} (${t.appearance}): ${line.join(", ")}`);
  else pass.push(t.id);
}

console.log(`Audited ${entries.length} themes (${pass.length} pass, ${issues.length} issues):`);
if (issues.length) issues.forEach(i => console.log(i));
else console.log("  All themes pass ✓");
