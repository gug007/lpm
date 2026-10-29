import { daysBetween, weekStart } from "./components/stats/statsDates";
import { RECAP_NEWS_DAYS } from "./components/recap/weeklyRecapModel";

const GITHUB_STAR_AFTER_DAYS = 7;

/** Whether `today` is a day to ask for a star: a week after lpm was first seen,
 *  and past the first days of the week, when the weekly recap toast has them. */
export function githubStarAskDue(since: string, today: string): boolean {
  return (
    daysBetween(since, today) >= GITHUB_STAR_AFTER_DAYS &&
    daysBetween(weekStart(today), today) >= RECAP_NEWS_DAYS
  );
}
