import { getCurrentWindow } from "@/platform/desktop";

/** Show the main window after first paint (starts hidden to avoid transparent flash). */
export async function revealMainWindow() {
  try {
    const win = getCurrentWindow();
    await win.show();
    await win.unminimize();
    await win.setFocus();
  } catch {
    // Web / already visible
  }
}
