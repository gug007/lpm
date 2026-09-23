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

type Part = { text: string; className?: string };

export async function ProofStrip() {
  const [stats, stars] = await Promise.all([
    getDownloadStats().catch(() => null),
    fetchStarCount(),
  ]);

  const parts: Part[] = [];
  if (stats && stats.total >= 1000) {
    parts.push({ text: `${formatDownloads(stats.total)} downloads` });
  }
  if (stars !== null && stars >= 50) {
    // The nav's star button already shows this count from sm up.
    parts.push({
      text: `${formatCount(stars)} GitHub stars`,
      className: "sm:hidden",
    });
  }

  return (
    <p className="mt-2 text-balance text-[11px] text-gray-500 dark:text-gray-400 tracking-wide">
      {parts.map(({ text, className }) => (
        <span key={text} className={className}>
          {text}
          <span aria-hidden="true" className="text-gray-300 dark:text-gray-700">
            {" · "}
          </span>
        </span>
      ))}
      <a
        href={REPO_URL}
        className="py-2 underline decoration-gray-300 dark:decoration-gray-600 underline-offset-4 hover:text-gray-900 dark:hover:text-white hover:decoration-current transition-colors duration-200"
      >
        MIT-licensed source on GitHub
      </a>
    </p>
  );
}
