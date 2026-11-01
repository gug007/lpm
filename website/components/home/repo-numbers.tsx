import Link from "next/link";
import type { ReactNode } from "react";
import { formatReleaseDate } from "@/lib/downloads";
import type { DownloadStats, LastCommit } from "@/lib/github-stats";
import { REPO_URL, STATS_PATH } from "@/lib/links";
import { LastCommitAgo } from "./last-commit-ago";

type Tile = { key: string; value: ReactNode; label: string; href: string };

const TILE =
  "group flex h-full flex-col items-center justify-center gap-1 rounded-2xl border border-gray-200 bg-gray-50/40 px-3 py-4 text-center transition-colors duration-200 hover:border-gray-300 dark:border-gray-800 dark:bg-white/[0.02] dark:hover:border-gray-700";

function tilesFor(
  stats: DownloadStats | null,
  lastCommit: LastCommit | null,
): Tile[] {
  const tiles: (Tile | null)[] = [
    stats && {
      key: "releases",
      value: stats.releases.length.toLocaleString("en-US"),
      label: "releases",
      href: `${REPO_URL}/releases`,
    },
    stats && {
      key: "downloads",
      value: stats.total.toLocaleString("en-US"),
      label: "desktop downloads",
      href: STATS_PATH,
    },
    lastCommit && {
      key: "commit",
      value: (
        <LastCommitAgo
          at={lastCommit.at}
          date={formatReleaseDate(lastCommit.at) ?? ""}
        />
      ),
      label: "last commit",
      href: lastCommit.url,
    },
    {
      key: "license",
      value: "MIT",
      label: "license, no paid tier",
      href: `${REPO_URL}/blob/main/LICENSE`,
    },
  ];
  return tiles.filter((tile): tile is Tile => tile !== null);
}

// "Actively maintained", as numbers anyone can click through and check.
export function RepoNumbers({
  stats,
  lastCommit,
}: {
  stats: DownloadStats | null;
  lastCommit: LastCommit | null;
}) {
  const tiles = tilesFor(stats, lastCommit);
  return (
    <div className="mb-8">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(({ key, value, label, href }) => {
          const body = (
            <>
              <span className="text-2xl font-bold tracking-tight tabular-nums text-gray-900 dark:text-white">
                {value}
              </span>
              <span className="text-xs text-gray-500 group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-200">
                {label}
              </span>
            </>
          );
          return (
            <li key={key}>
              {href.startsWith("/") ? (
                <Link href={href} prefetch={false} className={TILE}>
                  {body}
                </Link>
              ) : (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={TILE}
                >
                  {body}
                </a>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-center text-[11px] text-gray-500 dark:text-gray-400">
        From GitHub, refreshed hourly.
      </p>
    </div>
  );
}
