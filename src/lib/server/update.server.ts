import { requireToken } from "./license.server";

export type AppRelease = {
  version: string;
  notes: string;
  publishedAt: number;
  downloadUrl: string;
  sha256: string;
};

/** The client repository whose GitHub Releases carry the shipped EXE. */
const REPO = "Aditya4650-am/Gardens";
const GH_TTL_MS = 10 * 60_000;

const envRelease = () => ({
  downloadUrl: (process.env.CLIENT_UPDATE_URL ?? "").trim(),
  sha256: (process.env.CLIENT_UPDATE_SHA256 ?? "").trim().toLowerCase(),
});

// The fallback version is the one the bundled client reports; a phantom
// "1.15.0" used to be offered with no download behind it.
let current: AppRelease = {
  version: "1.1.31",
  notes: "Garden Studio client.",
  publishedAt: Date.now(),
  ...envRelease(),
};

type GhAsset = {
  name: string;
  browser_download_url: string;
  digest?: string | null;
  size: number;
};
type GhRelease = {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  assets: GhAsset[];
};

let ghCache: { at: number; value: AppRelease | null } = { at: 0, value: null };

/**
 * Read the newest GitHub release. GitHub records a `sha256:` digest for every
 * uploaded asset, which is exactly what the client verifies before swapping
 * itself — so a release published by CI is installable with no env vars.
 */
async function fromGithub(): Promise<AppRelease | null> {
  if (Date.now() - ghCache.at < GH_TTL_MS) return ghCache.value;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: {
        "User-Agent": "garden-studio",
        Accept: "application/vnd.github+json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`github ${res.status}`);
    const rel = (await res.json()) as GhRelease;
    const asset = (rel.assets ?? []).find((a) => /\.exe$/i.test(a.name));
    const digest = asset?.digest?.toLowerCase().startsWith("sha256:")
      ? asset.digest.slice("sha256:".length)
      : "";
    if (!asset || !/^[a-f0-9]{64}$/.test(digest)) throw new Error("no hashed exe asset");
    const notes =
      (rel.body ?? "")
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.length > 0 && !l.toLowerCase().includes("sha-256")) ?? "Update";
    const value: AppRelease = {
      version: rel.tag_name.replace(/^v/i, ""),
      notes: notes.slice(0, 400),
      publishedAt: Date.parse(rel.published_at) || Date.now(),
      downloadUrl: asset.browser_download_url,
      sha256: digest,
    };
    ghCache = { at: Date.now(), value };
    return value;
  } catch {
    ghCache = { at: Date.now(), value: null };
    return null;
  }
}

/** The release the client should install: published/env first, then GitHub. */
export async function getRelease(token: string): Promise<AppRelease> {
  requireToken(token);
  if (current.downloadUrl && current.sha256) return { ...current };
  const gh = await fromGithub();
  return gh ? { ...gh } : { ...current };
}

export function publishRelease(
  token: string,
  p: { version: string; notes: string; downloadUrl?: string; sha256?: string },
): AppRelease {
  const { license } = requireToken(token);
  if (!license.admin) throw new Error("Admin key required");
  const version = p.version.trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Version must look like 1.17.0");
  if (version === current.version) throw new Error("Bump the version first");
  const notes = p.notes.trim().slice(0, 400) || "Feature update";
  const downloadUrl = p.downloadUrl?.trim() || envRelease().downloadUrl;
  const sha256 = p.sha256?.trim().toLowerCase() || envRelease().sha256;
  if (!downloadUrl || !sha256) throw new Error("Download URL and SHA-256 are required for Client auto-update");
  let u: URL;
  try {
    u = new URL(downloadUrl);
  } catch {
    throw new Error("Download URL is invalid");
  }
  if (u.protocol !== "https:") throw new Error("Download URL must use HTTPS");
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("SHA-256 must be 64 hexadecimal characters");
  current = { version, notes, publishedAt: Date.now(), downloadUrl: u.toString(), sha256 };
  return { ...current };
}
