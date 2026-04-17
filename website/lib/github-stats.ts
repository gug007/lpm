const RELEASES_API = "https://api.github.com/repos/gug007/lpm/releases";

type RawAsset = {
  name: string;
  download_count: number;
  size: number;
  browser_download_url: string;
};

type RawRelease = {
  tag_name: string;
  name: string | null;
  published_at: string | null;
  html_url: string;
  assets: RawAsset[];
};

export type AssetStat = {
  name: string;
  label: string;
  downloads: number;
};

export type ReleaseStat = {
  tag: string;
  name: string;
  publishedAt: string | null;
  url: string;
  total: number;
  assets: AssetStat[];
};

export type DownloadStats = {
  total: number;
  releases: ReleaseStat[];
  fetchedAt: string;
};

function classify(name: string): string | null {
  if (name === "lpm-desktop-macos-arm64.dmg") {
    return "macOS Desktop — Apple Silicon";
  }
  if (name === "lpm-desktop-macos-amd64.dmg") {
    return "macOS Desktop — Intel";
  }
  return null;
}

export async function getDownloadStats(): Promise<DownloadStats | null> {
  const res = await fetch(`${RELEASES_API}?per_page=100`, {
    headers: { Accept: "application/vnd.github+json" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;

  const raw = (await res.json()) as RawRelease[];

  let total = 0;

  const releases: ReleaseStat[] = raw.map((r) => {
    let releaseTotal = 0;
    const assets: AssetStat[] = [];
    for (const a of r.assets) {
      const label = classify(a.name);
      if (!label) continue;
      releaseTotal += a.download_count;
      total += a.download_count;
      assets.push({
        name: a.name,
        label,
        downloads: a.download_count,
      });
    }
    assets.sort((a, b) => b.downloads - a.downloads);
    return {
      tag: r.tag_name,
      name: r.name || r.tag_name,
      publishedAt: r.published_at,
      url: r.html_url,
      total: releaseTotal,
      assets,
    };
  });

  return {
    total,
    releases,
    fetchedAt: new Date().toISOString(),
  };
}
