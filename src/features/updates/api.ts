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

const GH_RELEASES = "https://api.github.com/repos/voxiva-ai/voxiva-space/releases/latest";
const SITE_RELEASE = "https://voxiva.ai/api/releases/voxiva-space";

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

function pickExeAsset(assets: { name: string; browser_download_url: string }[] | undefined): string | null {
  if (!assets?.length) return null;
  const exe = assets.find((a) => /\.exe$/i.test(a.name) && /setup|nsis|x64/i.test(a.name))
    ?? assets.find((a) => /\.exe$/i.test(a.name));
  return exe?.browser_download_url ?? null;
}

async function checkGitHub(meta: AppMetadata): Promise<UpdateCheckResult> {
  const res = await fetch(GH_RELEASES, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "VoxivaSpace",
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const remote = (await res.json()) as {
    tag_name?: string;
    name?: string;
    body?: string;
    html_url?: string;
    assets?: { name: string; browser_download_url: string }[];
  };
  const latestVersion = (remote.tag_name || remote.name || "").replace(/^v/i, "");
  if (!latestVersion) throw new Error("GitHub release has no version");
  const downloadUrl =
    pickExeAsset(remote.assets) ||
    remote.html_url ||
    "https://github.com/voxiva-ai/voxiva-space/releases/latest";
  return {
    currentVersion: meta.version,
    latestVersion,
    updateAvailable: isNewer(latestVersion, meta.version),
    notes: (remote.body ?? "").trim().slice(0, 280),
    downloadUrl,
    downloadsPage: remote.html_url || "https://github.com/voxiva-ai/voxiva-space/releases/latest",
  };
}

async function checkSite(meta: AppMetadata): Promise<UpdateCheckResult> {
  const res = await fetch(SITE_RELEASE, { method: "GET" });
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

export async function getAppMetadata(): Promise<AppMetadata> {
  return invoke<AppMetadata>("get_app_metadata");
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const meta = await getAppMetadata();
  try {
    return await checkGitHub(meta);
  } catch {
    return await checkSite(meta);
  }
}

export async function openUpdateUrl(url: string): Promise<void> {
  await openUrl(url);
}
