import { Star } from "lucide-react";
import { REPO_API_URL, REPO_SLUG, REPO_URL } from "@/lib/links";

async function fetchStarCount(): Promise<number | null> {
  try {
    const res = await fetch(REPO_API_URL, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { stargazers_count?: number };
    return typeof data.stargazers_count === "number"
      ? data.stargazers_count
      : null;
  } catch {
    return null;
  }
}

function formatCount(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return n.toString();
}

export async function GitHubStarButton() {
  const stars = await fetchStarCount();
  const baseLabel = `Star ${REPO_SLUG} on GitHub`;
  const label = stars !== null ? `${baseLabel} (${stars} stars)` : baseLabel;

  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="group inline-flex items-center rounded-md border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-white/5 text-[12px] text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors duration-200 overflow-hidden"
    >
      <span className="inline-flex items-center gap-1 px-2 py-1">
        <Star
          className="w-[13px] h-[13px] text-gray-500 dark:text-gray-400 group-hover:text-amber-500 group-hover:fill-amber-400 transition-colors duration-200"
          aria-hidden="true"
        />
        <span>GitHub Stars</span>
      </span>
      {stars !== null && (
        <span className="border-l border-gray-200 dark:border-gray-800 px-2 py-1 tabular-nums text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors duration-200">
          {formatCount(stars)}
        </span>
      )}
    </a>
  );
}
