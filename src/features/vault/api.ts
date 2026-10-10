import { invoke } from "@/platform/desktop";
import type { VaultSession } from "@/lib/types";

export function scanVaultSessions(opts?: {
  query?: string;
  cwdFilter?: string | null;
  limit?: number;
}) {
  return invoke<VaultSession[]>("scan_vault_sessions", {
    request: {
      query: opts?.query?.trim() || null,
      cwdFilter: opts?.cwdFilter?.trim() || null,
      limit: opts?.limit ?? 200,
    },
  });
}
