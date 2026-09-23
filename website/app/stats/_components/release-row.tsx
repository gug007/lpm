import type { ReleaseStat } from "@/lib/github-stats";
import { dateFmt, numberFmt } from "./format";

export function ReleaseRow({ release }: { release: ReleaseStat }) {
  return (
    <li className="px-5 py-4">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <a
            href={release.url}
            className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:underline"
          >
            {release.tag}
          </a>
          {release.publishedAt && (
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
              {dateFmt.format(new Date(release.publishedAt))}
            </span>
          )}
        </div>
        <span className="text-sm tabular-nums text-gray-700 dark:text-gray-300">
          {numberFmt.format(release.total)}
        </span>
      </div>
      {release.assets.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-gray-500 dark:text-gray-400">
          {release.assets.map((a) => (
            <li key={a.name} className="flex items-center justify-between gap-4">
              <span className="truncate">{a.label}</span>
              <span className="tabular-nums">{numberFmt.format(a.downloads)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
