export type FileEntry = {
  name: string;
  path: string;
  isDir: boolean;
};

export type EditorKind = "text" | "image" | "binary";

export type TextFile = {
  path: string;
  content: string;
};

export type EditorTab = TextFile & {
  savedContent: string;
  dirty: boolean;
  kind?: EditorKind;
  mime?: string;
  size?: number;
};

const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|ico|avif)$/i;
const BINARY_RE =
  /\.(png|jpe?g|gif|webp|bmp|ico|avif|pdf|zip|exe|dll|wasm|woff2?|ttf|otf|mp[34]|wav|mov|webm|7z|rar|gz|br|psd|ai|sketch)$/i;

export function isImagePath(path: string) {
  return IMAGE_RE.test(path.replace(/\\/g, "/"));
}

/** SVG stays editable as text; other media opens as preview / binary. */
export function isBinaryPreviewPath(path: string) {
  return BINARY_RE.test(path.replace(/\\/g, "/"));
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
