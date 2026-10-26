import { Fragment } from "react";
import { withCode } from "@/components/with-code";
import { releaseTagUrl, type ChangelogDay } from "@/lib/changelog";
import { formatReleaseDate } from "@/lib/downloads";

const INLINE_CODE =
  "rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em] text-gray-800 dark:bg-white/[0.07] dark:text-gray-200";

export function ChangelogEntry({ day }: { day: ChangelogDay }) {
  const [latest, ...rest] = day.releases;
  const earlier = rest.reverse();
  const notes = day.releases.flatMap(({ notes }) => notes ?? []);

  return (
    <li
      id={`v${latest.version}`}
      className="grid scroll-mt-28 gap-1 sm:grid-cols-[5.5rem_1fr] sm:gap-6"
    >
      <time
        dateTime={day.date}
        className="text-sm tabular-nums text-gray-500 dark:text-gray-400 sm:pt-0.5"
      >
        {formatReleaseDate(day.date)}
      </time>
      <div className="min-w-0">
        <h3 className="flex flex-wrap items-center gap-2">
          <a
            href={releaseTagUrl(latest.version)}
            className="font-mono text-[15px] font-semibold text-gray-900 hover:underline dark:text-gray-100"
          >
            v{latest.version}
          </a>
          {latest.beta && (
            <span className="rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300">
              Beta
            </span>
          )}
        </h3>
        {earlier.length > 0 && (
          <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            Also includes{" "}
            {earlier.map(({ version }, i) => (
              <Fragment key={version}>
                {i > 0 && ", "}
                <a
                  id={`v${version}`}
                  href={releaseTagUrl(version)}
                  className="scroll-mt-28 font-mono hover:underline"
                >
                  v{version}
                </a>
              </Fragment>
            ))}
          </p>
        )}
        {notes.length > 0 && (
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-gray-700 marker:text-gray-400 dark:text-gray-300 dark:marker:text-gray-600">
            {notes.map((note, i) => (
              <li key={i}>{withCode(note, INLINE_CODE)}</li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
