import "server-only";
import {
  DOWNLOAD_ENTRIES,
  type DesktopOs,
  type DownloadPlatform,
} from "./downloads";
import { REPO_API_URL } from "./links";

const LATEST_RELEASE_API = `${REPO_API_URL}/releases/latest`;

type ExpectedAsset = {
  platform: DownloadPlatform;
  label: string;
  architecture: string;
  required: boolean;
};

// The Windows and Linux files are attached by later release jobs, so for a
// while after each release (or for good if a job fails) only the DMGs exist.
const EXPECTED_ASSETS: ExpectedAsset[] = [
  { platform: "mac-arm", label: "macOS Apple Silicon", architecture: "arm64", required: true },
  { platform: "mac-intel", label: "macOS Intel", architecture: "x86_64", required: true },
  { platform: "windows-x64", label: "Windows installer", architecture: "x64", required: false },
  { platform: "linux-deb", label: "Linux .deb", architecture: "amd64", required: false },
  { platform: "linux-rpm", label: "Linux .rpm", architecture: "amd64", required: false },
  { platform: "linux-appimage", label: "Linux AppImage", architecture: "amd64", required: false },
];

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
  platform: DownloadPlatform;
  os: DesktopOs;
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
      const { filename, os } = DOWNLOAD_ENTRIES[expected.platform];
      const asset = release.assets.find(({ name }) => name === filename);
      const sha256 = parseSha256(asset?.digest ?? null);
      if (!asset || !sha256) {
        if (expected.required) return null;
        continue;
      }

      assets.push({
        filename,
        platform: expected.platform,
        os,
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
