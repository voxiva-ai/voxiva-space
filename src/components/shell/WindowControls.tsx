import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Frameless window chrome — min / max / close (F11 fullscreen stays a keyboard shortcut). */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setMaximized(await getCurrentWindow().isMaximized());
    } catch {
      // web preview
    }
  }, []);

  useEffect(() => {
    void refresh();
    const win = getCurrentWindow();
    let unlistenResize: (() => void) | undefined;
    void win
      .onResized(() => {
        void refresh();
      })
      .then((fn) => {
        unlistenResize = fn;
      })
      .catch(() => undefined);
    return () => unlistenResize?.();
  }, [refresh]);

  return (
    <div className="vs-winControls" data-no-drag onPointerDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="vs-winBtn"
        aria-label="Minimize"
        title="Minimize"
        onClick={() => void getCurrentWindow().minimize()}
      >
        <span className="vs-winGlyph is-min" />
      </button>
      <button
        type="button"
        className="vs-winBtn"
        aria-label={maximized ? "Restore" : "Maximize"}
        title={maximized ? "Restore" : "Maximize"}
        onClick={() => void getCurrentWindow().toggleMaximize().then(() => refresh())}
      >
        <span className={`vs-winGlyph ${maximized ? "is-restore" : "is-max"}`} />
      </button>
      <button
        type="button"
        className="vs-winBtn is-close"
        aria-label="Close"
        title="Close"
        onClick={() => void getCurrentWindow().close()}
      >
        <span className="vs-winGlyph is-close" />
      </button>
    </div>
  );
}
