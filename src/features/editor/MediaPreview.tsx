import { convertFileSrc } from "@/platform/desktop";
import { useMemo, useState, type DragEvent } from "react";
import { joinWorkspacePath, VOXIVA_PATH_MIME } from "@/features/terminal/drop";
import {
  formatBytes,
  isAudioPath,
  isFileIconPreviewPath,
  isImagePath,
  isPdfPath,
  isVideoPath,
} from "./types";
import { fileTypeLabel, MaterialFileIcon } from "./MaterialFileIcon";

function FileTypeCard({
  name,
  mime,
  size,
  compact,
}: {
  name: string;
  mime: string;
  size?: number;
  compact?: boolean;
}) {
  const label = fileTypeLabel(name, mime);
  return (
    <div className={`vs-fileTypeCard${compact ? " is-compact" : ""}`}>
      <MaterialFileIcon name={name} isDir={false} size={compact ? 56 : 72} />
      <span className="vs-fileTypeBadge">{label}</span>
      <strong>{name}</strong>
      {!compact ? (
        <span className="vs-fileTypeMeta">
          {mime}
          {typeof size === "number" ? ` · ${formatBytes(size)}` : ""}
        </span>
      ) : null}
    </div>
  );
}

type MediaPreviewProps = {
  path: string;
  mime: string;
  size?: number;
  kind: "image" | "binary";
  workspaceRoot?: string;
  absPath?: string;
  /** Legacy fallback when absPath is unavailable. */
  base64?: string;
  /** Hide meta row when the pane already shows a header. */
  chrome?: "default" | "pane";
};

function resolveSrc(absPath: string | undefined, mime: string, base64?: string) {
  if (absPath) {
    try {
      return convertFileSrc(absPath);
    } catch {
      // browser / non-tauri
    }
  }
  if (base64) return `data:${mime};base64,${base64}`;
  return "";
}

export function MediaPreview({
  path,
  mime,
  size,
  kind,
  workspaceRoot = "",
  absPath,
  base64,
  chrome = "default",
}: MediaPreviewProps) {
  const src = useMemo(() => resolveSrc(absPath, mime, base64), [absPath, mime, base64]);
  const name = path.split(/[\\/]/).pop() || path;
  const abs = absPath || joinWorkspacePath(workspaceRoot, path);
  const [fit, setFit] = useState(true);
  const [zoom, setZoom] = useState(1);
  const compact = chrome === "pane";

  const video = isVideoPath(path) || mime.startsWith("video/");
  const audio = isAudioPath(path) || mime.startsWith("audio/");
  const pdf = isPdfPath(path) || mime === "application/pdf";
  const pdfSrc = pdf ? `${src}#toolbar=1&navpanes=1&view=FitH` : src;
  const image =
    !video &&
    !audio &&
    !pdf &&
    (kind === "image" || isImagePath(path) || mime.startsWith("image/"));
  const iconOnly = !image && !video && !audio && !pdf && isFileIconPreviewPath(path);

  function onDragStart(event: DragEvent) {
    event.dataTransfer.setData(VOXIVA_PATH_MIME, abs || path);
    event.dataTransfer.setData("text/plain", abs || path);
    event.dataTransfer.effectAllowed = "copy";
    // Never let the browser use the full image/video as a giant drag preview.
    const ghost = document.createElement("div");
    ghost.textContent = name;
    Object.assign(ghost.style, {
      position: "fixed",
      top: "-100px",
      left: "-100px",
      maxWidth: "180px",
      padding: "5px 8px",
      borderRadius: "6px",
      background: "#171b22",
      color: "#eef2f8",
      font: "600 11px system-ui",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    });
    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, 10, 10);
    window.setTimeout(() => ghost.remove(), 0);
  }

  const meta = compact ? null : (
    <div className="vs-mediaPreviewMeta">
      <strong>{name}</strong>
      <span>
        {mime}
        {typeof size === "number" ? ` · ${formatBytes(size)}` : ""}
      </span>
    </div>
  );

  const shellClass = [
    "vs-mediaPreview",
    compact ? "is-pane" : "",
    video ? "is-video" : "",
    pdf ? "is-pdf" : "",
    audio ? "is-audio" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (!src && !iconOnly) {
    return (
      <div className={shellClass}>
        {meta}
        <div className="vs-mediaPreviewStage is-binary">
          <FileTypeCard name={name} mime={mime} size={size} compact={compact} />
        </div>
      </div>
    );
  }

  if (iconOnly) {
    return (
      <div className={shellClass} draggable title={abs || path} onDragStart={onDragStart}>
        {meta}
        <div className="vs-mediaPreviewStage is-fileIcon">
          <FileTypeCard name={name} mime={mime} size={size} compact={compact} />
        </div>
      </div>
    );
  }

  if (image) {
    return (
      <div className={shellClass}>
        {meta}
        {compact ? null : (
          <div className="vs-mediaToolbar" role="toolbar" aria-label="Image zoom">
            <button type="button" className={fit ? "is-active" : undefined} onClick={() => setFit(true)}>
              Fit
            </button>
            <button
              type="button"
              className={!fit && zoom === 1 ? "is-active" : undefined}
              onClick={() => {
                setFit(false);
                setZoom(1);
              }}
            >
              1:1
            </button>
            <button
              type="button"
              onClick={() => {
                setFit(false);
                setZoom((z) => Math.max(0.25, Math.round((z - 0.25) * 100) / 100));
              }}
            >
              −
            </button>
            <button
              type="button"
              onClick={() => {
                setFit(false);
                setZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100));
              }}
            >
              +
            </button>
            {!fit ? <span className="vs-mediaZoomLabel">{Math.round(zoom * 100)}%</span> : null}
          </div>
        )}
        <div className={`vs-mediaPreviewStage${compact || fit ? " is-fit" : " is-zoom"}`}>
          <img
            src={src}
            alt={name}
            draggable
            title={abs || path}
            onDragStart={onDragStart}
            style={
              compact || fit
                ? undefined
                : { width: `${zoom * 100}%`, maxWidth: "none", maxHeight: "none" }
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass} draggable title={abs || path} onDragStart={onDragStart}>
      {meta}
      <div
        className={`vs-mediaPreviewStage is-binary${video ? " is-video" : ""}${pdf ? " is-pdf" : ""}${audio ? " is-audio" : ""}`}
      >
        {pdf ? (
          <iframe
            title={name}
            src={pdfSrc}
            className="vs-mediaFrame"
            aria-label={`${name} PDF viewer with page navigation`}
          />
        ) : audio ? (
          <div className="vs-mediaAudio">
            <audio controls src={src} />
          </div>
        ) : video ? (
          <video controls playsInline preload="metadata" src={src} className="vs-mediaVideo" />
        ) : (
          <FileTypeCard name={name} mime={mime} size={size} compact={compact} />
        )}
      </div>
    </div>
  );
}
