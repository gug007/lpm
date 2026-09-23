import { REPO_URL } from "@/lib/links";

export const STATS_LINK =
  "underline underline-offset-2 hover:text-gray-900 dark:hover:text-gray-100";

export function StatsHeader() {
  return (
    <header>
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
        lpm download stats
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
        Downloads of the macOS desktop app — the Apple Silicon and Intel disk
        images — summed across every release on{" "}
        <a href={`${REPO_URL}/releases`} className={STATS_LINK}>
          GitHub Releases
        </a>
        . Updated hourly.
      </p>
    </header>
  );
}
