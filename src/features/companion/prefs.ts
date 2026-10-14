export type CompanionPrefs = {
  machineName: string;
  showSidebarButton: boolean;
};

const PREFS_KEY = "voxiva-companion-prefs";
const DEFAULTS: CompanionPrefs = { machineName: "", showSidebarButton: true };

export function loadCompanionPrefs(): CompanionPrefs {
  try {
    const value = JSON.parse(localStorage.getItem(PREFS_KEY) || "null") as Partial<CompanionPrefs> | null;
    return {
      machineName: typeof value?.machineName === "string" ? value.machineName.slice(0, 48) : DEFAULTS.machineName,
      showSidebarButton: typeof value?.showSidebarButton === "boolean" ? value.showSidebarButton : DEFAULTS.showSidebarButton,
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveCompanionPrefs(prefs: CompanionPrefs) {
  const next = {
    machineName: prefs.machineName.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 48),
    showSidebarButton: Boolean(prefs.showSidebarButton),
  };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    // Keep the current session usable when local storage is unavailable.
  }
  window.dispatchEvent(new Event("voxiva-companion-prefs"));
  return next;
}
