import { ChevronDown } from "lucide-react";
import type { ReleaseStat } from "@/lib/github-stats";
import { ReleaseRow } from "./release-row";

const SHOWN = 25;
const LIST =
  "divide-y divide-gray-100 dark:divide-gray-800/60 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden";

export function ReleaseList({ releases }: { releases: ReleaseStat[] }) {
  const recent = releases.slice(0, SHOWN);
  const older = releases.slice(SHOWN);
  return (
    <>
      <ul className={`mt-4 ${LIST}`}>
        {recent.map((r) => (
          <ReleaseRow key={r.tag} release={r} />
        ))}
      </ul>
      {older.length > 0 && (
        <details className="group mt-4">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white [&::-webkit-details-marker]:hidden">
            <ChevronDown
              aria-hidden
              className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            />
            <span className="group-open:hidden">
              Show {older.length} older releases
            </span>
            <span className="hidden group-open:inline">
              Hide older releases
            </span>
          </summary>
          <ul className={`mt-2 ${LIST}`}>
            {older.map((r) => (
              <ReleaseRow key={r.tag} release={r} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
