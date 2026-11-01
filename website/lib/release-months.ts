import { monthOf } from "./changelog-days";
import type { ReleaseStat } from "./github-stats";

export type ReleaseMonth = { month: string; releases: number };

const MONTHS_SHOWN = 12;

function nextMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, "0")}`;
}

// Every month from the first release to the latest, quiet ones included, so a
// slow month shows as a short bar instead of silently dropping out.
export function releasesPerMonth(releases: ReleaseStat[]): ReleaseMonth[] {
  const counts = new Map<string, number>();
  for (const { publishedAt } of releases) {
    if (!publishedAt) continue;
    const month = monthOf(publishedAt);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  const months = [...counts.keys()].sort();
  if (months.length === 0) return [];
  const all: ReleaseMonth[] = [];
  for (let month = months[0]; month <= months[months.length - 1]; month = nextMonth(month)) {
    all.push({ month, releases: counts.get(month) ?? 0 });
  }
  return all.slice(-MONTHS_SHOWN);
}
