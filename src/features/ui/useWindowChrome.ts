import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Global window chrome shortcuts for frameless Space:
 * F11 — toggle fullscreen, Escape — leave fullscreen.
 */
export function useWindowChrome() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
          if (event.key !== "F11") return;
        }
      }

      if (event.key === "F11") {
        event.preventDefault();
        void (async () => {
          try {
            const win = getCurrentWindow();
            if (await win.isFullscreen()) await win.setFullscreen(false);
            else await win.setFullscreen(true);
          } catch {
            // web preview
          }
        })();
        return;
      }

      if (event.key === "Escape") {
        void (async () => {
          try {
            const win = getCurrentWindow();
            if (await win.isFullscreen()) {
              event.preventDefault();
              await win.setFullscreen(false);
            }
          } catch {
            // web preview
          }
        })();
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}
