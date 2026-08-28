import { useEffect, useRef, useState } from "react";
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

const HIDE_MS = 2400;

/** Floating zoom pill — appears only while zooming, hides at 100% when idle. */
export function ZoomHud() {
  const { t } = useSpace();
  const [level, setLevel] = useState(loadZoom);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);

  const scheduleHide = () => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setVisible(false), HIDE_MS);
  };

  useEffect(
    () =>
      subscribeZoom((next, fromUser) => {
        setLevel(next);
        if (!fromUser) return;
        setVisible(true);
        scheduleHide();
      }),
    [],
  );

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  if (!visible) return null;

  const pct = zoomPercent(level);
  const atMin = level <= ZOOM_MIN + 0.001;
  const atMax = level >= ZOOM_MAX - 0.001;
  const atDefault = Math.abs(level - ZOOM_DEFAULT) < 0.001;

  return (
    <div className="vs-zoomHud" role="status" aria-live="polite">
      <div className="vs-zoomHudInner" role="group" aria-label={t("settings.zoom")}>
        <button
          type="button"
          className="vs-zoomBtn"
          disabled={atMin}
          title={t("settings.zoomOut")}
          aria-label={t("settings.zoomOut")}
          onClick={() => {
            stepZoom(-ZOOM_STEP);
            scheduleHide();
          }}
        >
          −
        </button>
        <button
          type="button"
          className={`vs-zoomPct${atDefault ? " is-default" : ""}`}
          title={t("settings.zoomReset")}
          aria-label={`${pct}% — ${t("settings.zoomReset")}`}
          onClick={() => {
            applyZoom(ZOOM_DEFAULT);
            scheduleHide();
          }}
        >
          {pct}%
        </button>
        <button
          type="button"
          className="vs-zoomBtn"
          disabled={atMax}
          title={t("settings.zoomIn")}
          aria-label={t("settings.zoomIn")}
          onClick={() => {
            stepZoom(ZOOM_STEP);
            scheduleHide();
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}
