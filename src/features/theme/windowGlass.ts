import { Effect, EffectState, getCurrentWindow } from "@tauri-apps/api/window";
import type { ThemeId } from "@/features/workspace/persist";

/** Acrylic when glass theme is on; opaque otherwise. Needs transparent window. */
export async function syncWindowGlass(theme: ThemeId) {
  try {
    const win = getCurrentWindow();
    if (theme === "glass") {
      await win.setEffects({
        effects: [Effect.Acrylic],
        state: EffectState.Active,
      });
    } else {
      await win.clearEffects();
    }
  } catch {
    // Web / unsupported platform — CSS glass still applies
  }
}
