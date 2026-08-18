import { convertFileSrc } from "@tauri-apps/api/core";
import { useMemo, useState, type DragEvent } from "react";
import { joinWorkspacePath, VOXIVA_PATH_MIME } from "@/features/terminal/drop";
import { formatBytes, isAudioPath, isPdfPath, isVideoPath } from "./types";

type MediaPreviewProps = {
  path: string;
  mime: string;
  size?: number;
  kind: "image" | "binary";
  workspaceRoot?: string;
  absPath?: string;
  /** Legacy fallback when absPath is unavailable. */
  base64?: string;
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
}: MediaPreviewProps) {
  const src = useMemo(() => resolveSrc(absPath, mime, base64), [absPath, mime, base64]);
  const name = path.split(/[\\/]/).pop() || path;
  const abs = absPath || joinWorkspacePath(workspaceRoot, path);
  const [fit, setFit] = useState(true);
  const [zoom, setZoom] = useState(1);

  function onDragStart(event: DragEvent) {
    event.dataTransfer.setData(VOXIVA_PATH_MIME, abs || path);
    event.dataTransfer.setData("text/plain", abs || path);
    event.dataTransfer.effectAllowed = "copy";
  }

  const meta = (
    <div className="vs-mediaPreviewMeta">
      <strong>{name}</strong>
      <span>
        {mime}
        {typeof size === "number" ? ` · ${formatBytes(size)}` : ""}
      </span>
    </div>
  );

  if (!src) {
    return (
      <div className="vs-mediaPreview">
        {meta}
        <div className="vs-mediaPreviewStage is-binary">
          <div className="vs-mediaBinary">
            <strong>Cannot preview</strong>
            <span>File path could not be resolved for preview.</span>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "image") {
    return (
      <div className="vs-mediaPreview">
        {meta}
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
        <div className={`vs-mediaPreviewStage${fit ? " is-fit" : " is-zoom"}`}>
          <img
            src={src}
            alt={name}
            draggable
            title={abs || path}
            onDragStart={onDragStart}
            style={fit ? undefined : { width: `${zoom * 100}%`, maxWidth: "none", maxHeight: "none" }}
          />
        </div>
      </div>
    );
  }

  const video = isVideoPath(path) || mime.startsWith("video/");
  const audio = isAudioPath(path) || mime.startsWith("audio/");
  const pdf = isPdfPath(path) || mime === "application/pdf";

  return (
    <div className="vs-mediaPreview" draggable title={abs || path} onDragStart={onDragStart}>
      {meta}
      <div className="vs-mediaPreviewStage is-binary">
        {pdf ? (
          <iframe title={name} src={src} className="vs-mediaFrame" />
        ) : audio ? (
          <div className="vs-mediaAudio">
            <audio controls src={src} />
          </div>
        ) : video ? (
          <video controls playsInline preload="metadata" src={src} className="vs-mediaVideo" />
        ) : (
          <div className="vs-mediaBinary">
            <strong>Binary file</strong>
            <span>Preview is not available for this type. Open it from the file tree in Explorer.</span>
          </div>
        )}
      </div>
    </div>
  );
}
