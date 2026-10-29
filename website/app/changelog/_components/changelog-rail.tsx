"use client";

import type { ComponentProps } from "react";
import { monthLabel } from "@/lib/changelog-days";
import { ChangelogFilters } from "./changelog-filters";

type RailMonth = { month: string; count: number };

type Props = ComponentProps<typeof ChangelogFilters> & {
  months: RailMonth[];
  current: string | null;
  onMonth: (month: string) => void;
};

export function ChangelogRail({ months, current, onMonth, ...filters }: Props) {
  return (
    <aside aria-label="Browse the changelog" className="hidden pt-14 lg:block">
      <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-6">
        <ChangelogFilters {...filters} />
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
          By month
        </p>
        <ol className="mt-2 space-y-px">
          {months.map(({ month, count }) => {
            const active = month === current;
            return (
              <li key={month}>
                <button
                  type="button"
                  onClick={() => onMonth(month)}
                  aria-current={active ? "true" : undefined}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                    active
                      ? "bg-gray-100 font-semibold text-gray-900 dark:bg-white/[0.07] dark:text-white"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.04] dark:hover:text-white"
                  }`}
                >
                  <span>{monthLabel(month)}</span>
                  <span
                    className={`tabular-nums ${active ? "text-gray-700 dark:text-gray-300" : "text-gray-500 dark:text-gray-400"}`}
                  >
                    {count}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}
