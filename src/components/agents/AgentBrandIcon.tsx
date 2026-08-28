import claudeSvg from "@/assets/brand/claude.svg?raw";
import codexSvg from "@/assets/brand/codex.svg?raw";
import geminiSvg from "@/assets/brand/gemini.svg?raw";
import opencodeSvg from "@/assets/brand/opencode.svg?raw";
import cursorSvg from "@/assets/brand/cursor.svg?raw";
import ampSvg from "@/assets/brand/amp.svg?raw";
import aiderSvg from "@/assets/brand/aider.svg?raw";
import gooseSvg from "@/assets/brand/goose.svg?raw";
import shellSvg from "@/assets/brand/shell.svg?raw";

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
  opencode: opencodeSvg,
  claude: claudeSvg,
  codex: codexSvg,
  gemini: geminiSvg,
  "cursor-agent": cursorSvg,
  amp: ampSvg,
  aider: aiderSvg,
  goose: gooseSvg,
  shell: shellSvg,
};

/** CLI-specific marks: Claude Code, Codex, Gemini CLI, OpenCode, … */
export function AgentBrandIcon({ id, size = 20, className }: Props) {
  const svg = MARK[id] ?? MARK.shell;
  return <BrandMark svg={svg} size={size} className={className} />;
}
