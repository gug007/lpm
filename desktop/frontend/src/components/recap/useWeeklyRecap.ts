import { useCallback, useEffect, useRef, useState } from "react";
import { WeeklyRecap as LoadWeeklyRecap } from "../../../bridge/commands";
import type { RecapPeriod, WeeklyRecap } from "./weeklyRecapModel";

// Weeks and months already read in this window, so Stats, the toast and the
// recap dialog share one scan of the history files.
const read = new Map<string, WeeklyRecap>();

const keyOf = (week: string, period: RecapPeriod) => `${period}:${week}`;

export function loadWeeklyRecap(
  week: string,
  period: RecapPeriod = "week",
  fresh = false,
): Promise<WeeklyRecap> {
  const key = keyOf(week, period);
  const held = read.get(key);
  if (held && !fresh) return Promise.resolve(held);
  return (LoadWeeklyRecap(week, period, fresh) as Promise<WeeklyRecap>).then((recap) => {
    read.set(key, recap);
    return recap;
  });
}

/** The recap of the week or month starting `week`, or null to read none. */
export function useWeeklyRecap(week: string | null, period: RecapPeriod = "week") {
  const [recap, setRecap] = useState<WeeklyRecap | null>(() =>
    week ? read.get(keyOf(week, period)) ?? null : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef(0);

  const load = useCallback(
    async (fresh = false) => {
      if (!week) return;
      const mine = ++latest.current;
      setLoading(true);
      setError("");
      try {
        const next = await loadWeeklyRecap(week, period, fresh);
        if (mine === latest.current) setRecap(next);
      } catch (cause) {
        if (mine === latest.current) setError(String(cause));
      } finally {
        if (mine === latest.current) setLoading(false);
      }
    },
    [week, period],
  );

  useEffect(() => {
    setRecap(week ? read.get(keyOf(week, period)) ?? null : null);
    void load();
  }, [week, period, load]);

  const current = recap?.week === week && (recap.period ?? "week") === period;
  return { recap: current ? recap : null, loading, error, reload: () => load(true) };
}
