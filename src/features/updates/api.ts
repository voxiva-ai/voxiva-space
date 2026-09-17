import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@/features/terminal/api";

export type AppMetadata = {
  name: string;
  version: string;
  channel?: string;
};

export type UpdateCheckResult = {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  notes: string;
  downloadUrl: string;
  downloadsPage: string;
};

const RELEASE_URL = "https://voxiva.ai/api/releases/voxiva-space";

function parseSemver(v: string): [number, number, number] | null {
  const clean = v.trim().replace(/^v/i, "");
  const [a, b, c] = clean.split(".");
  const major = Number(a);
  const minor = Number(b ?? "0");
  const patch = Number(String(c ?? "0").replace(/\D.*$/, ""));
  if (![major, minor, patch].every((n) => Number.isFinite(n))) return null;
  return [major, minor, patch];
}

function isNewer(remote: string, local: string): boolean {
  const r = parseSemver(remote);
  const l = parseSemver(local);
  if (!r || !l) return remote.trim() !== local.trim();
  if (r[0] !== l[0]) return r[0] > l[0];
  if (r[1] !== l[1]) return r[1] > l[1];
  return r[2] > l[2];
}

export async function getAppMetadata(): Promise<AppMetadata> {
  return invoke<AppMetadata>("get_app_metadata");
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const meta = await getAppMetadata();
  const res = await fetch(RELEASE_URL, { method: "GET" });
  if (!res.ok) throw new Error(`Update server ${res.status}`);
  const remote = (await res.json()) as {
    version: string;
    notes?: string;
    downloadUrl: string;
    downloadsPage?: string;
  };
  return {
    currentVersion: meta.version,
    latestVersion: remote.version,
    updateAvailable: isNewer(remote.version, meta.version),
    notes: remote.notes ?? "",
    downloadUrl: remote.downloadUrl,
    downloadsPage: remote.downloadsPage || "https://voxiva.ai/downloads",
  };
}

export async function openUpdateUrl(url: string): Promise<void> {
  await openUrl(url);
}
