export type FileEntry = {
  name: string;
  path: string;
  isDir: boolean;
};

export type TextFile = {
  path: string;
  content: string;
};

const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|ico|avif|svg)$/i;
const VIDEO_RE = /\.(mp4|webm|mov|m4v|mkv|avi|ogv)$/i;
const AUDIO_RE = /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i;
const PDF_RE = /\.pdf$/i;
const OFFICE_RE = /\.(docx?|xlsx?|pptx?|csv|tsv)$/i;
const ARCHIVE_RE = /\.(zip|rar|7z|tar|gz|br)$/i;
const TEXT_PREVIEW_RE = /\.(txt|log|md|markdown)$/i;
const BINARY_RE =
  /\.(png|jpe?g|gif|webp|bmp|ico|avif|svg|pdf|zip|exe|dll|wasm|woff2?|ttf|otf|mp[34]|wav|mov|m4v|mkv|avi|webm|ogv|ogg|m4a|aac|flac|opus|7z|rar|gz|br|psd|ai|sketch|docx?|xlsx?|pptx?|csv|tsv|txt|log)$/i;

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

export function isOfficePath(path: string) {
  return OFFICE_RE.test(normPath(path));
}

export function isArchivePath(path: string) {
  return ARCHIVE_RE.test(normPath(path));
}

export function isTextPreviewPath(path: string) {
  return TEXT_PREVIEW_RE.test(normPath(path));
}

/** Files that open in-pane with a type icon (office, archives, text, media). */
export function isFileIconPreviewPath(path: string) {
  return (
    isOfficePath(path) ||
    isArchivePath(path) ||
    isTextPreviewPath(path)
  );
}

/** Visual/media files open in preview; SVG is rendered rather than shown as XML. */
export function isBinaryPreviewPath(path: string) {
  return BINARY_RE.test(normPath(path));
}

/** Drop into a Space pane → in-pane preview (not pasted into the shell). */
export function isPanePreviewPath(path: string) {
  return (
    isImagePath(path) ||
    isVideoPath(path) ||
    isAudioPath(path) ||
    isPdfPath(path) ||
    isFileIconPreviewPath(path)
  );
}

/** MIME from Finder/Explorer HTML5 drops without a disk path. */
export function isPanePreviewMime(mime: string) {
  const m = mime.toLowerCase();
  return (
    m.startsWith("image/") ||
    m.startsWith("video/") ||
    m.startsWith("audio/") ||
    m === "application/pdf" ||
    m.includes("spreadsheet") ||
    m.includes("wordprocessing") ||
    m.includes("presentation") ||
    m === "text/csv" ||
    m === "text/plain" ||
    m === "application/zip"
  );
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
