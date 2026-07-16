import {
  fetchStarCount,
  formatCount,
  getDownloadStats,
} from "@/lib/github-stats";
import { REPO_URL } from "@/lib/links";

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

  return (
    <p className="mt-6 text-[12px] text-gray-500 dark:text-gray-400 tracking-wide">
      {parts.map((part) => (
        <span key={part}>
          {part}
          <span aria-hidden="true"> · </span>
        </span>
      ))}
      <a
        href={REPO_URL}
        className="underline decoration-gray-300 dark:decoration-gray-600 underline-offset-4 hover:text-gray-900 dark:hover:text-white hover:decoration-current transition-colors duration-200"
      >
        Free &amp; open source
      </a>
    </p>
  );
}
