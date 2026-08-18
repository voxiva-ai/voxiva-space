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
  /** Absolute disk path for asset:// preview (images / video / audio / PDF). */
  absPath?: string;
};

const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|ico|avif)$/i;
const VIDEO_RE = /\.(mp4|webm|mov|m4v|mkv|avi|ogv)$/i;
const AUDIO_RE = /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i;
const PDF_RE = /\.pdf$/i;
const BINARY_RE =
  /\.(png|jpe?g|gif|webp|bmp|ico|avif|pdf|zip|exe|dll|wasm|woff2?|ttf|otf|mp[34]|wav|mov|m4v|mkv|avi|webm|ogv|ogg|m4a|aac|flac|opus|7z|rar|gz|br|psd|ai|sketch)$/i;

function normPath(path: string) {
  return path.replace(/\\/g, "/");
}

export function isImagePath(path: string) {
  return IMAGE_RE.test(normPath(path));
}

export function isVideoPath(path: string) {
  return VIDEO_RE.test(normPath(path));
}

export function isAudioPath(path: string) {
  return AUDIO_RE.test(normPath(path));
}

export function isPdfPath(path: string) {
  return PDF_RE.test(normPath(path));
}

/** SVG stays editable as text; other media opens as preview / binary. */
export function isBinaryPreviewPath(path: string) {
  return BINARY_RE.test(normPath(path));
}

export function editorKindForPath(path: string): EditorKind {
  return isImagePath(path) ? "image" : "binary";
}

export function isMarkdownPath(path: string) {
  return /\.(md|mdx|markdown)$/i.test(path.replace(/\\/g, "/"));
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
