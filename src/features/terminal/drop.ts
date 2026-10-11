import { getNativeFilePath } from "@/platform/desktop";

export const VOXIVA_PATH_MIME = "application/x-voxiva-path";
export const VOXIVA_TEXT_MIME = "application/x-voxiva-text";

export function joinWorkspacePath(cwd: string, rel: string) {
  const trimmed = rel.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith("\\\\") || trimmed.startsWith("/")) return trimmed;
  const base = cwd.replace(/[\\/]+$/, "");
  if (!base) return trimmed;
  const sep = /\\/.test(cwd) || /^[a-zA-Z]:/.test(cwd) ? "\\" : "/";
  return `${base}${sep}${trimmed.replace(/^[\\/]+/, "").replace(/[\\/]/g, sep)}`;
}

export function quoteForShell(value: string) {
  if (!value) return value;
  if (!/[\s"]/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

export function formatPathsForPty(paths: string[]) {
  return paths.map((path) => path.trim()).filter(Boolean).map(quoteForShell).join(" ");
}

export function payloadFromDataTransfer(data: DataTransfer, opts?: { cwd?: string | null }): string | null {
  const typedText = data.getData(VOXIVA_TEXT_MIME);
  if (typedText) return typedText;
  const typedPath = data.getData(VOXIVA_PATH_MIME);
  if (typedPath && !typedPath.includes("\n")) {
    return formatPathsForPty([opts?.cwd ? joinWorkspacePath(opts.cwd, typedPath) : typedPath]);
  }
  const plain = data.getData("text/plain");
  if (!plain) return null;
  if (plain.startsWith("voxiva-agent:")) return null;
  if (plain.includes("\n") || plain.includes("\r")) return plain;
  const looksPath = /[\\/]/.test(plain) || /^[a-zA-Z]:/.test(plain) || /\.(png|jpe?g|gif|webp|bmp|ico|avif|svg|ts|tsx|js|jsx|json|md|rs|py|go|css|html)$/i.test(plain.trim());
  return looksPath
    ? formatPathsForPty([opts?.cwd ? joinWorkspacePath(opts.cwd, plain.trim()) : plain.trim()])
    : plain;
}

export function rawPathsFromDataTransfer(data: DataTransfer, opts?: { cwd?: string | null }): string[] {
  const paths: string[] = [];
  const push = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const absolute = opts?.cwd ? joinWorkspacePath(opts.cwd, value) : value;
    if (!paths.includes(absolute)) paths.push(absolute);
  };
  const typedPath = data.getData(VOXIVA_PATH_MIME);
  if (typedPath && !typedPath.includes("\n")) push(typedPath);
  const plain = data.getData("text/plain");
  if (plain && !plain.includes("\n") && !plain.startsWith("voxiva-agent:")) push(plain);
  for (const file of Array.from(data.files ?? [])) {
    const path = getNativeFilePath(file);
    if (path) push(path);
  }
  return paths;
}
