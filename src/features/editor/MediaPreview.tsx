import { formatBytes } from "./types";

type MediaPreviewProps = {
  path: string;
  mime: string;
  base64: string;
  size?: number;
  kind: "image" | "binary";
};

export function MediaPreview({ path, mime, base64, size, kind }: MediaPreviewProps) {
  const src = `data:${mime};base64,${base64}`;
  const name = path.split(/[\\/]/).pop() || path;

  if (kind === "image") {
    return (
      <div className="vs-mediaPreview">
        <div className="vs-mediaPreviewMeta">
          <strong>{name}</strong>
          <span>
            {mime}
            {typeof size === "number" ? ` · ${formatBytes(size)}` : ""}
          </span>
        </div>
        <div className="vs-mediaPreviewStage">
          <img src={src} alt={name} />
        </div>
      </div>
    );
  }

  const isPdf = mime === "application/pdf";
  const isAudio = mime.startsWith("audio/");
  const isVideo = mime.startsWith("video/");

  return (
    <div className="vs-mediaPreview">
      <div className="vs-mediaPreviewMeta">
        <strong>{name}</strong>
        <span>
          {mime}
          {typeof size === "number" ? ` · ${formatBytes(size)}` : ""}
        </span>
      </div>
      <div className="vs-mediaPreviewStage is-binary">
        {isPdf ? (
          <iframe title={name} src={src} className="vs-mediaFrame" />
        ) : isAudio ? (
          <audio controls src={src} />
        ) : isVideo ? (
          <video controls src={src} className="vs-mediaVideo" />
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
