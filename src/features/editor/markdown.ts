import DOMPurify from "dompurify";
import { marked } from "marked";

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

marked.setOptions({
  gfm: true,
  breaks: true,
});

function stripFrontmatter(source: string) {
  return source.replace(FRONTMATTER_RE, "");
}

/** Inject data-source-line markers so preview can sync-scroll with the editor. */
function annotateSourceLines(source: string) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (!inFence && /^(#{1,6})\s+\S/.test(trimmed)) {
      out.push(`<!--vs-md-line:${i + 1}-->`);
    }
    out.push(line);
  }
  return out.join("\n");
}

export function renderMarkdown(source: string) {
  const body = stripFrontmatter(source);
  const annotated = annotateSourceLines(body);
  const raw = marked.parse(annotated, { async: false }) as string;
  // Keep our line markers for sync scroll.
  const withAttrs = raw.replace(
    /<!--vs-md-line:(\d+)-->\s*(<(h[1-6])\b)/gi,
    (_m, line, open) => `${open} data-source-line="${line}"`,
  );
  return DOMPurify.sanitize(withAttrs, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["data-source-line"],
  });
}

const PREVIEW_KEY = "voxiva.editor.markdownPreviewOpen.v1";

export function loadMarkdownPreviewOpen(): boolean {
  try {
    return localStorage.getItem(PREVIEW_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveMarkdownPreviewOpen(open: boolean) {
  try {
    localStorage.setItem(PREVIEW_KEY, open ? "1" : "0");
  } catch {
    // quota / private mode
  }
}
