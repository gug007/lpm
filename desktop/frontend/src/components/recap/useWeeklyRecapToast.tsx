import { useEffect } from "react";
import { PushWeeklyRecap } from "../../../bridge/commands";
import { IS_MIRROR_WINDOW } from "../../mirror";
import { toast } from "../../notifications/toast";
import { useSettingsStore } from "../../store/settings";
import { useWeeklyRecapStore } from "../../store/weeklyRecap";
import { daysBetween, localDate, weekStart } from "../stats/statsDates";
import { RecapToastPreview } from "./RecapToastPreview";
import { loadWeeklyRecap } from "./useWeeklyRecap";
import { RECAP_NEWS_DAYS, recapView, recapWeekStart } from "./weeklyRecapModel";

// Late enough that settings are read and the app has settled after launch.
const FIRST_CHECK_MS = 20_000;
// An app left open over the weekend still tells on Monday.
const CHECK_EVERY_MS = 60 * 60_000;
// Not in the small hours of Monday, while Sunday's work may still be going.
const MONDAY_FROM_HOUR = 9;

/** One toast early in the week when last week's recap is ready, up until it's
 *  answered. */
export function useWeeklyRecapToast(): void {
  useEffect(() => {
    if (IS_MIRROR_WINDOW) return;
    let stopped = false;
    let checking = false;

    const check = async () => {
      const now = new Date();
      const today = localDate(now);
      const week = recapWeekStart("last", today);
      const settings = useSettingsStore.getState();
      if (checking || settings.weeklyRecap === false || settings.weeklyRecapToasted === week) return;
      const day = daysBetween(weekStart(today), today);
      if (day >= RECAP_NEWS_DAYS || (day === 0 && now.getHours() < MONDAY_FROM_HOUR)) return;
      checking = true;
      try {
        const view = recapView(await loadWeeklyRecap(week));
        if (stopped) return;
        await useSettingsStore.getState().update({ weeklyRecapToasted: week });
        if (view.empty) return;
        toast("Your week in lpm is ready", {
          id: `weekly-recap:${week}`,
          description: view.range,
          content: <RecapToastPreview view={view} />,
          // It comes once a week, so it waits to be answered.
          duration: Infinity,
          action: { label: "View & share", onClick: () => useWeeklyRecapStore.getState().show("last") },
          cancel: { label: "Not now", onClick: () => {} },
        });
        void PushWeeklyRecap(
          week,
          "Your week in lpm is ready",
          `${view.hours} of agents working for you · ${view.range}`,
        ).catch(() => {});
      } catch {
        // Read again at the next check.
      } finally {
        checking = false;
      }
    };

    const first = window.setTimeout(() => void check(), FIRST_CHECK_MS);
    const every = window.setInterval(() => void check(), CHECK_EVERY_MS);
    return () => {
      stopped = true;
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, []);
}
