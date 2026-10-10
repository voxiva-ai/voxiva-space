import { getCurrentWindow } from "@/platform/desktop";
import type { ThemeId } from "@/features/theme";

/** Catalog themes are opaque — clear any leftover acrylic. */
export async function syncWindowGlass(_theme: ThemeId) {
  try {
    await getCurrentWindow().clearEffects();
  } catch {
    // Web / unsupported platform
  }
}
