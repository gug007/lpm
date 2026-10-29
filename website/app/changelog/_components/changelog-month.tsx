"use client";

import { ChevronDown } from "lucide-react";
import { monthLabel, monthPath, releasesText, type ChangelogDay } from "@/lib/changelog-days";
import { ChangelogEntry } from "./changelog-entry";

type Props = {
  month: string;
  releases: number;
  days: ChangelogDay[] | null;
  expanded: boolean;
  loading: boolean;
  onOpen: (month: string) => void;
};

export function ChangelogMonth({ month, releases, days, expanded, loading, onOpen }: Props) {
  const label = monthLabel(month);
  return (
    <section aria-labelledby={`month-${month}`} className="mt-14" id={`m-${month}`}>
      <div className="flex items-baseline justify-between gap-4 border-b border-gray-200 pb-3 dark:border-gray-800">
        <h2
          id={`month-${month}`}
          className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400"
        >
          {label}
        </h2>
        <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
          {releasesText(releases)}
        </span>
      </div>
      {expanded && days ? (
        <ol className="mt-8 space-y-10">
          {days.map((day) => (
            <ChangelogEntry key={day.date} day={day} />
          ))}
        </ol>
      ) : (
        <a
          href={monthPath(month)}
          onClick={(event) => {
            event.preventDefault();
            onOpen(month);
          }}
          aria-busy={loading}
          className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-gray-700 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
        >
          <ChevronDown aria-hidden className="h-4 w-4" />
          {loading ? "Loading…" : `Show ${label}`}
        </a>
      )}
    </section>
  );
}
