import claudeSvg from "@/assets/brand/claude.svg?raw";
import codexSvg from "@/assets/brand/codex.svg?raw";
import geminiSvg from "@/assets/brand/gemini.svg?raw";
import voxivaCliSvg from "@/assets/brand/voxiva-cli.svg?raw";
import opencodeSvg from "@/assets/brand/opencode.svg?raw";
import cursorSvg from "@/assets/brand/cursor.svg?raw";
import ampSvg from "@/assets/brand/amp.svg?raw";
import aiderSvg from "@/assets/brand/aider.svg?raw";
import gooseSvg from "@/assets/brand/goose.svg?raw";
import shellSvg from "@/assets/brand/shell.svg?raw";
import piSvg from "@/assets/brand/pi.svg?raw";
import ompSvg from "@/assets/brand/omp.svg?raw";

type Props = { id: string; size?: number; className?: string };

let markUid = 0;

/** thesvg.org / official CLI marks — original fills, unique gradient ids. */
function BrandMark({ svg, size, className }: { svg: string; size: number; className?: string }) {
  const uid = `m${++markUid}`;
  const html = svg
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/\sstyle="[^"]*"/gi, "")
    .replace(/\s(width|height)="[^"]*"/g, "")
    .replace(/\bid="([^"]+)"/g, `id="$1-${uid}"`)
    .replace(/url\(#([^)]+)\)/g, `url(#$1-${uid})`)
    .replace("<svg", `<svg width="${size}" height="${size}" aria-hidden="true" focusable="false"`);

  return (
    <span
      className={`vs-brandMark${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const MARK: Record<string, string> = {
  voxiva: voxivaCliSvg,
  opencode: opencodeSvg,
  opencode2: opencodeSvg,
  claude: claudeSvg,
  "claude-teams": claudeSvg,
  codex: codexSvg,
  gemini: geminiSvg,
  "cursor-agent": cursorSvg,
  amp: ampSvg,
  aider: aiderSvg,
  goose: gooseSvg,
  shell: shellSvg,
  pi: piSvg,
  omp: ompSvg,
};

const iconFiles = import.meta.glob("/src/assets/brand/agent-icons/*.png", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const ICON_NAMES: Record<string, string> = {
  "cursor-agent": "cursor", "claude-teams": "claude", opencode2: "opencode", mimo: "mimo-code",
  "deepseek-harness": "dsh", kilocode: "kilo", charm: "crush", auggie: "aug",
  qwen: "qwen-code", "rovo-dev": "rovo",
};

/** CLI-specific marks: Claude Code, Codex, Gemini CLI, OpenCode, … */
export function AgentBrandIcon({ id, size = 20, className }: Props) {
  const svg = MARK[id];
  if (svg) return <BrandMark svg={svg} size={size} className={className} />;
  const imageUrl = iconFiles[`/src/assets/brand/agent-icons/${ICON_NAMES[id] ?? id}.png`];
  if (imageUrl) return <img className={`vs-brandMark${className ? ` ${className}` : ""}`} src={imageUrl} width={size} height={size} alt="" aria-hidden="true" />;
  const colors = ["#7c5cff", "#14a88a", "#e57642", "#3978e8", "#c54b78", "#1697a8"];
  const color = colors[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length];
  return <span className={`vs-agentBrandFallback${className ? ` ${className}` : ""}`} style={{ width: size, height: size, background: `${color}18`, color, fontSize: size * 0.52 }} aria-hidden="true">{id.replace(/[^a-z0-9]/gi, "").slice(0, 1).toUpperCase()}</span>;
}
