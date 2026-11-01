import { Star } from "lucide-react";
import { fetchStarCount, formatCount } from "@/lib/github-stats";
import { REPO_SLUG, REPO_URL } from "@/lib/links";

// A small count next to the logo reads as "few people use this", which the
// download numbers don't support, so the count only shows once it helps.
const SHOW_COUNT_FROM = 1000;

export async function GitHubStarButton() {
  const stars = await fetchStarCount();
  const count = stars !== null && stars >= SHOW_COUNT_FROM ? stars : null;

  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center whitespace-nowrap rounded-md border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-white/5 text-[12px] text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors duration-200 overflow-hidden"
    >
      <span data-nosnippet className="inline-flex items-center gap-1 px-2 py-1">
        <Star
          className="w-[13px] h-[13px] text-gray-500 dark:text-gray-400 group-hover:text-amber-500 group-hover:fill-amber-400 transition-colors duration-200"
          aria-hidden="true"
        />
        <span>Star on GitHub</span>
      </span>
      {count !== null && (
        <span
          data-nosnippet
          className="border-l border-gray-200 dark:border-gray-800 px-2 py-1 tabular-nums text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors duration-200"
        >
          {formatCount(count)}
        </span>
      )}
      <span className="sr-only">, {REPO_SLUG}</span>
    </a>
  );
}
