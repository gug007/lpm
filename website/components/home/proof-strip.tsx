import {
  fetchStarCount,
  formatCount,
  getDownloadStats,
} from "@/lib/github-stats";

function formatDownloads(n: number): string {
  if (n >= 1000) {
    return `${(Math.floor(n / 100) * 100).toLocaleString("en-US")}+`;
  }
  return n.toLocaleString("en-US");
}

export async function ProofStrip() {
  const [stats, stars] = await Promise.all([
    getDownloadStats().catch(() => null),
    fetchStarCount(),
  ]);

  const parts: string[] = [];
  if (stats && stats.total >= 1000) {
    parts.push(`${formatDownloads(stats.total)} downloads`);
  }
  if (stars !== null && stars >= 50) {
    parts.push(`${formatCount(stars)} GitHub stars`);
  }
  parts.push("Free & open source");

  return (
    <p className="mt-6 text-[12px] text-gray-500 dark:text-gray-400 tracking-wide">
      {parts.join(" · ")}
    </p>
  );
}
