import type { ThemeAppearance, ThemeDefinition, ThemeId } from "./catalog.generated";
import { THEME_CATALOG, getTheme } from "./catalog.generated";

export type ThemeFamily = {
  familyId: string;
  label: string;
  official: boolean;
  /** Available appearances for this pack (site light/dark toggle). */
  appearances: ThemeAppearance[];
  /** Theme ids keyed by appearance. */
  byAppearance: Partial<Record<ThemeAppearance, ThemeId>>;
};

const PREFS_KEY = "voxiva-theme-family-prefs-v1";

let familiesCache: ThemeFamily[] | null = null;

export function listThemeFamilies(): ThemeFamily[] {
  if (familiesCache) return familiesCache;
  const map = new Map<string, ThemeFamily>();
  for (const theme of THEME_CATALOG) {
    let family = map.get(theme.familyId);
    if (!family) {
      family = {
        familyId: theme.familyId,
        label: theme.label,
        official: theme.official,
        appearances: [],
        byAppearance: {},
      };
      map.set(theme.familyId, family);
    }
    if (!family.appearances.includes(theme.appearance)) {
      family.appearances.push(theme.appearance);
    }
    family.byAppearance[theme.appearance] = theme.id as ThemeId;
  }
  for (const family of map.values()) {
    // Stable: dark first when both exist (matches dual packs UX).
    family.appearances.sort((a, b) => Number(b === "dark") - Number(a === "dark"));
  }
  familiesCache = [...map.values()].sort((a, b) => {
    if (a.official !== b.official) return a.official ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
  return familiesCache;
}

export function familyOf(themeId: string): ThemeFamily {
  const theme = getTheme(themeId);
  return (
    listThemeFamilies().find((f) => f.familyId === theme.familyId) ?? listThemeFamilies()[0]
  );
}

export function themeIdForAppearance(
  family: ThemeFamily,
  appearance: ThemeAppearance,
): ThemeId {
  const exact = family.byAppearance[appearance];
  if (exact) return exact;
  return (
    family.byAppearance.dark ||
    family.byAppearance.light ||
    ("voxiva" as ThemeId)
  );
}

export function previewForFamily(
  family: ThemeFamily,
  appearance: ThemeAppearance,
): ThemeDefinition {
  return getTheme(themeIdForAppearance(family, appearance));
}

/** Primary swatch for a family card (independent of the globally active theme). */
export function defaultAppearance(family: ThemeFamily): ThemeAppearance {
  if (family.appearances.includes("dark")) return "dark";
  return family.appearances[0] || "dark";
}

export type FamilyAppearancePrefs = Record<string, ThemeAppearance>;

export function loadFamilyAppearancePrefs(): FamilyAppearancePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as FamilyAppearancePrefs;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveFamilyAppearancePrefs(prefs: FamilyAppearancePrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota
  }
}

/** Which appearance a family card should preview / restore. */
export function appearanceForFamilyCard(
  family: ThemeFamily,
  prefs: FamilyAppearancePrefs,
  activeFamilyId: string,
  activeAppearance: ThemeAppearance,
): ThemeAppearance {
  if (family.familyId === activeFamilyId && family.appearances.includes(activeAppearance)) {
    return activeAppearance;
  }
  const remembered = prefs[family.familyId];
  if (remembered && family.appearances.includes(remembered)) return remembered;
  return defaultAppearance(family);
}
