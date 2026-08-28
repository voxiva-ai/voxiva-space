import { useEffect, useState } from "react";
import {
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  applyZoom,
  loadZoom,
  stepZoom,
  subscribeZoom,
  zoomPercent,
} from "@/features/ui/zoom";
import { useSpace } from "@/features/workspace/SpaceContext";

type ZoomControlsProps = {
  /** Show min/max hint under the control (settings page). */
  showRange?: boolean;
};

export function ZoomControls({ showRange = false }: ZoomControlsProps) {
  const { t } = useSpace();
  const [level, setLevel] = useState(loadZoom);

  useEffect(() => subscribeZoom((l) => setLevel(l)), []);

  const pct = zoomPercent(level);
  const atMin = level <= ZOOM_MIN + 0.001;
  const atMax = level >= ZOOM_MAX - 0.001;
  const atDefault = Math.abs(level - ZOOM_DEFAULT) < 0.001;

  return (
    <div className={`vs-zoomWrap${showRange ? " is-settings" : ""}`}>
      <div className="vs-zoomControls" role="group" aria-label={t("settings.zoom")}>
        <button
          type="button"
          className="vs-zoomBtn"
          disabled={atMin}
          title={t("settings.zoomOut")}
          aria-label={t("settings.zoomOut")}
          onClick={() => stepZoom(-ZOOM_STEP)}
        >
          −
        </button>
        <button
          type="button"
          className={`vs-zoomPct${atDefault ? " is-default" : ""}`}
          title={t("settings.zoomReset")}
          aria-label={`${pct}% — ${t("settings.zoomReset")}`}
          onClick={() => applyZoom(ZOOM_DEFAULT)}
        >
          {pct}%
        </button>
        <button
          type="button"
          className="vs-zoomBtn"
          disabled={atMax}
          title={t("settings.zoomIn")}
          aria-label={t("settings.zoomIn")}
          onClick={() => stepZoom(ZOOM_STEP)}
        >
          +
        </button>
      </div>
      {showRange ? <p className="vs-zoomRange">{t("settings.zoomRange")}</p> : null}
    </div>
  );
}
