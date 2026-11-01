import Link from "next/link";
import { monthLabel, monthPath, releasesText } from "@/lib/changelog-days";
import type { ReleaseMonth } from "@/lib/release-months";

const PLOT_PX = 112;

const shortMonth = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});

// Months of bars show the project is alive faster than one total can. Only
// the peak and the latest month carry a number; the rest show theirs on hover
// or focus, and every bar opens that month in the changelog.
export function ReleaseChart({
  months,
  currentMonth,
}: {
  months: ReleaseMonth[];
  currentMonth: string;
}) {
  if (months.length < 2) return null;
  const max = Math.max(...months.map(({ releases }) => releases));
  const peak = months.findIndex(({ releases }) => releases === max);
  const last = months.length - 1;
  const inProgress = months[last].month === currentMonth;

  return (
    <figure className="mt-3 rounded-2xl border border-gray-200 bg-gray-50/40 px-4 pb-3 pt-4 sm:px-6 dark:border-gray-800 dark:bg-white/[0.02]">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Releases per month
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Since {monthLabel(months[0].month)}
          {inProgress && ` · ${monthLabel(months[last].month)} so far`}
        </span>
      </figcaption>
      <ol className="mt-3 flex items-end gap-0.5 border-b border-gray-200 dark:border-gray-700">
        {months.map(({ month, releases }, index) => {
          const latest = index === last;
          const labelled = latest || index === peak;
          const name = `${monthLabel(month)}${latest && inProgress ? " so far" : ""}: ${releasesText(releases)}`;
          return (
            <li key={month} className="flex-1">
              <Link
                href={monthPath(month)}
                prefetch={false}
                aria-label={name}
                className="group flex flex-col items-center justify-end rounded-t outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                style={{ height: PLOT_PX + 20 }}
              >
                <span
                  className={`mb-1 text-[11px] font-medium tabular-nums text-gray-700 transition-opacity dark:text-gray-200 ${
                    labelled
                      ? ""
                      : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                  }`}
                >
                  {releases}
                </span>
                <span
                  className={`w-full max-w-6 rounded-t transition-colors ${
                    latest
                      ? "bg-emerald-600 dark:bg-emerald-400"
                      : "bg-gray-300 group-hover:bg-gray-400 dark:bg-gray-600 dark:group-hover:bg-gray-500"
                  }`}
                  style={{ height: Math.round((releases / max) * PLOT_PX) }}
                />
              </Link>
            </li>
          );
        })}
      </ol>
      <ol aria-hidden className="mt-1.5 flex gap-0.5">
        {months.map(({ month }) => (
          <li
            key={month}
            className="flex-1 text-center text-[11px] text-gray-500 dark:text-gray-400"
          >
            {shortMonth.format(new Date(`${month}-01T00:00:00Z`))}
          </li>
        ))}
      </ol>
    </figure>
  );
}
