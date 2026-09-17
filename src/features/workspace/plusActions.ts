/** cmux-style custom actions for the sidebar "+" button. */

const STORAGE_KEY = "voxiva-space-plus-actions-v1";

export type PlusActionId =
  | "new-space"
  | "duplicate-space"
  | `layout:${string}`;

export type PlusActionsPrefs = {
  /** Left-click on "+" runs this. */
  primaryId: PlusActionId;
};

const DEFAULT_PREFS: PlusActionsPrefs = {
  primaryId: "new-space",
};

export function loadPlusActionsPrefs(): PlusActionsPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<PlusActionsPrefs>;
    if (typeof parsed.primaryId === "string" && parsed.primaryId.trim()) {
      return { primaryId: parsed.primaryId as PlusActionId };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_PREFS };
}

export function savePlusActionsPrefs(prefs: PlusActionsPrefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function setPrimaryPlusAction(id: PlusActionId) {
  const next = { primaryId: id };
  savePlusActionsPrefs(next);
  return next;
}
