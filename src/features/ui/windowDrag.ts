import { getCurrentWindow } from "@/platform/desktop";

/** Frameless window: start a move from the title drag strip (not from buttons). */
export function beginWindowDrag(event: { button: number }) {
  if (event.button !== 0) return;
  try {
    void getCurrentWindow().startDragging();
  } catch {
    // web preview
  }
}

export function toggleMaximize() {
  try {
    void getCurrentWindow()
      .toggleMaximize()
      .catch(() => undefined);
  } catch {
    // web preview
  }
}
