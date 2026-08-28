import wordIcon from "material-icon-theme/icons/word.svg";
import powerpointIcon from "material-icon-theme/icons/powerpoint.svg";
import tableIcon from "material-icon-theme/icons/table.svg";
import zipIcon from "material-icon-theme/icons/zip.svg";
import documentIcon from "material-icon-theme/icons/document.svg";
import fileIcon from "material-icon-theme/icons/file.svg";
import folderIcon from "material-icon-theme/icons/folder.svg";
import folderOpenIcon from "material-icon-theme/icons/folder-open.svg";
import folderNodeIcon from "material-icon-theme/icons/folder-node.svg";
import folderNodeOpenIcon from "material-icon-theme/icons/folder-node-open.svg";
import folderSrcIcon from "material-icon-theme/icons/folder-src.svg";
import folderSrcOpenIcon from "material-icon-theme/icons/folder-src-open.svg";
import cssIcon from "material-icon-theme/icons/css.svg";
import dockerIcon from "material-icon-theme/icons/docker.svg";
import gitIcon from "material-icon-theme/icons/git.svg";
import htmlIcon from "material-icon-theme/icons/html.svg";
import imageIcon from "material-icon-theme/icons/image.svg";
import javascriptIcon from "material-icon-theme/icons/javascript.svg";
import jsonIcon from "material-icon-theme/icons/json.svg";
import licenseIcon from "material-icon-theme/icons/license.svg";
import markdownIcon from "material-icon-theme/icons/markdown.svg";
import pdfIcon from "material-icon-theme/icons/pdf.svg";
import pythonIcon from "material-icon-theme/icons/python.svg";
import reactIcon from "material-icon-theme/icons/react.svg";
import rustIcon from "material-icon-theme/icons/rust.svg";
import sassIcon from "material-icon-theme/icons/sass.svg";
import svgIcon from "material-icon-theme/icons/svg.svg";
import typescriptIcon from "material-icon-theme/icons/typescript.svg";
import videoIcon from "material-icon-theme/icons/video.svg";
import audioIcon from "material-icon-theme/icons/audio.svg";
import viteIcon from "material-icon-theme/icons/vite.svg";
import yamlIcon from "material-icon-theme/icons/yaml.svg";

const extensionIcons: Record<string, string> = {
  css: cssIcon,
  html: htmlIcon,
  htm: htmlIcon,
  js: javascriptIcon,
  cjs: javascriptIcon,
  mjs: javascriptIcon,
  json: jsonIcon,
  md: markdownIcon,
  mdx: markdownIcon,
  png: imageIcon,
  jpg: imageIcon,
  jpeg: imageIcon,
  gif: imageIcon,
  webp: imageIcon,
  bmp: imageIcon,
  ico: imageIcon,
  avif: imageIcon,
  mp4: videoIcon,
  webm: videoIcon,
  mov: videoIcon,
  m4v: videoIcon,
  mkv: videoIcon,
  avi: videoIcon,
  ogv: videoIcon,
  mp3: audioIcon,
  wav: audioIcon,
  ogg: audioIcon,
  m4a: audioIcon,
  aac: audioIcon,
  flac: audioIcon,
  opus: audioIcon,
  pdf: pdfIcon,
  doc: wordIcon,
  docx: wordIcon,
  xls: tableIcon,
  xlsx: tableIcon,
  csv: tableIcon,
  tsv: tableIcon,
  ppt: powerpointIcon,
  pptx: powerpointIcon,
  zip: zipIcon,
  rar: zipIcon,
  "7z": zipIcon,
  gz: zipIcon,
  txt: documentIcon,
  log: documentIcon,
  py: pythonIcon,
  rs: rustIcon,
  sass: sassIcon,
  scss: sassIcon,
  svg: svgIcon,
  ts: typescriptIcon,
  tsx: reactIcon,
  jsx: reactIcon,
  yaml: yamlIcon,
  yml: yamlIcon,
};

const fileNameIcons: Record<string, string> = {
  "dockerfile": dockerIcon,
  ".gitignore": gitIcon,
  "license": licenseIcon,
  "license.md": licenseIcon,
  "vite.config.ts": viteIcon,
  "vite.config.js": viteIcon,
};

export function MaterialFileIcon({
  name,
  isDir,
  open = false,
  size = 16,
  className = "",
}: {
  name: string;
  isDir: boolean;
  open?: boolean;
  size?: number;
  className?: string;
}) {
  const lower = name.toLowerCase();
  let src = fileIcon;
  if (isDir) {
    if (lower === "src" || lower === "src-tauri") src = open ? folderSrcOpenIcon : folderSrcIcon;
    else if (lower === "node_modules") src = open ? folderNodeOpenIcon : folderNodeIcon;
    else src = open ? folderOpenIcon : folderIcon;
  } else {
    const extension = lower.includes(".") ? lower.split(".").pop() ?? "" : "";
    src = fileNameIcons[lower] ?? extensionIcons[extension] ?? fileIcon;
  }
  const large = size > 20 ? " is-large" : "";
  return (
    <img
      className={`vs-fileIcon${large}${className ? ` ${className}` : ""}`}
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden
    />
  );
}

/** Human label for file type chip (mp4 → Video, docx → Word, …). */
export function fileTypeLabel(name: string, mime = ""): string {
  const lower = name.toLowerCase();
  const ext = lower.includes(".") ? lower.split(".").pop() ?? "" : "";
  const m = mime.toLowerCase();
  if (m.startsWith("video/") || /^(mp4|webm|mov|mkv|avi|m4v|ogv)$/.test(ext)) return "Video";
  if (m.startsWith("audio/") || /^(mp3|wav|ogg|m4a|aac|flac|opus)$/.test(ext)) return "Audio";
  if (m.startsWith("image/") || /^(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/.test(ext)) return "Image";
  if (ext === "pdf" || m === "application/pdf") return "PDF";
  if (/^(docx?)$/.test(ext)) return "Word";
  if (/^(xlsx?|csv|tsv)$/.test(ext)) return "Excel";
  if (/^(pptx?)$/.test(ext)) return "PowerPoint";
  if (/^(zip|rar|7z|gz|tar)$/.test(ext)) return "Archive";
  if (/^(txt|md|log)$/.test(ext)) return "Text";
  return ext ? ext.toUpperCase() : "File";
}
