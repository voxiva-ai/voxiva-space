import { useCallback, useRef } from "react";
import { pickWorkspaceFolder } from "@/features/terminal/api";

/** Opens the native folder picker without triggering React re-renders while waiting. */
export function useFolderBrowse() {
  const pickingRef = useRef(false);

  return useCallback(async (startDir?: string | null) => {
    if (pickingRef.current) return null;
    pickingRef.current = true;
    try {
      return await pickWorkspaceFolder(startDir ?? null);
    } finally {
      pickingRef.current = false;
    }
  }, []);
}
