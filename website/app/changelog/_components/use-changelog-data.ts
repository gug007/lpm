"use client";

import { useCallback, useRef, useState } from "react";
import {
  CHANGELOG_DATA_PATH,
  daysByMonth,
  type ChangelogDay,
} from "@/lib/changelog-days";

export type MonthDays = Map<string, ChangelogDay[]>;

// Every release, fetched once on demand: older months, search and topic filters
// all read from it.
export function useChangelogData() {
  const [months, setMonths] = useState<MonthDays | null>(null);
  const [loading, setLoading] = useState(false);
  const pending = useRef<Promise<MonthDays> | null>(null);

  const load = useCallback((): Promise<MonthDays> => {
    if (!pending.current) {
      setLoading(true);
      pending.current = fetch(CHANGELOG_DATA_PATH)
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json() as Promise<ChangelogDay[]>;
        })
        .then((days) => {
          const byMonth: MonthDays = daysByMonth(days);
          setMonths(byMonth);
          return byMonth;
        })
        .catch((error: unknown) => {
          pending.current = null;
          throw error;
        })
        .finally(() => setLoading(false));
    }
    return pending.current;
  }, []);

  return { months, loading, load };
}
