import "server-only";
import { REPO_API_URL } from "./links";

const LATEST_RELEASE_API = `${REPO_API_URL}/releases/latest`;

const EXPECTED_ASSETS = [
  {
    filename: "lpm-desktop-macos-arm64.dmg",
    label: "Apple Silicon",
    architecture: "arm64",
  },
  {
    filename: "lpm-desktop-macos-amd64.dmg",
    label: "Intel",
    architecture: "x86_64",
  },
] as const;

type RawAsset = {
  name: string;
  digest: string | null;
  size: number;
  browser_download_url: string;
};

type RawRelease = {
  tag_name: string;
  published_at: string | null;
  html_url: string;
  assets: RawAsset[];
};

export type ReleaseVerificationAsset = {
  filename: string;
  label: string;
  architecture: string;
  sha256: string;
  size: number;
  downloadUrl: string;
};

export type ReleaseVerification = {
  tag: string;
  publishedAt: string | null;
  releaseUrl: string;
  assets: ReleaseVerificationAsset[];
};

function parseSha256(digest: string | null): string | null {
  if (!digest?.startsWith("sha256:")) return null;
  const sha256 = digest.slice("sha256:".length);
  return /^[a-f0-9]{64}$/.test(sha256) ? sha256 : null;
}

export async function getLatestReleaseVerification(): Promise<ReleaseVerification | null> {
  try {
    const response = await fetch(LATEST_RELEASE_API, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;

    const release = (await response.json()) as RawRelease;
    const assets: ReleaseVerificationAsset[] = [];

    for (const expected of EXPECTED_ASSETS) {
      const asset = release.assets.find(
        ({ name }) => name === expected.filename,
      );
      const sha256 = parseSha256(asset?.digest ?? null);
      if (!asset || !sha256) return null;

      assets.push({
        filename: expected.filename,
        label: expected.label,
        architecture: expected.architecture,
        sha256,
        size: asset.size,
        downloadUrl: asset.browser_download_url,
      });
    }

    return {
      tag: release.tag_name,
      publishedAt: release.published_at,
      releaseUrl: release.html_url,
      assets,
    };
  } catch {
    return null;
  }
}
