import type { LpmCommand } from "../../lpmCommands";

// How often a skill ran and how long ago, as its row shows it, and the orders
// the list can be sorted in.

export type SkillSort = "name" | "recent" | "most";

export const SKILL_SORTS: { value: SkillSort; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "recent", label: "Recently run" },
  { value: "most", label: "Most run" },
];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// "now", "40m", "2h", "3d", "5mo", "2y": how long ago `at` was.
export function runAge(at: number, now: number): string {
  const ago = Math.max(0, now - at);
  if (ago < MINUTE) return "now";
  if (ago < HOUR) return `${Math.floor(ago / MINUTE)}m`;
  if (ago < DAY) return `${Math.floor(ago / HOUR)}h`;
  if (ago < 60 * DAY) return `${Math.floor(ago / DAY)}d`;
  if (ago < 365 * DAY) return `${Math.floor(ago / (30 * DAY))}mo`;
  return `${Math.floor(ago / (365 * DAY))}y`;
}

// "2h · 14×" beside a skill that has run, null for one that hasn't.
export function runsLabel(c: Pick<LpmCommand, "runs" | "lastRunAt">, now: number): string | null {
  if (!c.runs || c.lastRunAt === undefined) return null;
  return `${runAge(c.lastRunAt, now)} · ${c.runs}×`;
}

// The same, spelled out for its tooltip.
export function runsTitle(c: Pick<LpmCommand, "runs" | "lastRunAt">): string | null {
  if (!c.runs || c.lastRunAt === undefined) return null;
  const when = new Date(c.lastRunAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return `Ran ${c.runs === 1 ? "once" : `${c.runs} times`} on this computer · last ${when}`;
}

const byName = (a: LpmCommand, b: LpmCommand) => a.name.toLowerCase().localeCompare(b.name.toLowerCase());

// `commands` in the chosen order; skills that never ran keep their names' order
// after the ones that did.
export function sortSkills(commands: LpmCommand[], sort: SkillSort): LpmCommand[] {
  if (sort === "name") return commands;
  const key = (c: LpmCommand) => (sort === "recent" ? (c.lastRunAt ?? -1) : (c.runs ?? 0));
  return [...commands].sort((a, b) => key(b) - key(a) || byName(a, b));
}

const SORT_KEY = "lpm:skills:sort:v1";

export function loadSkillSort(): SkillSort {
  try {
    const saved = window.localStorage.getItem(SORT_KEY);
    if (SKILL_SORTS.some((s) => s.value === saved)) return saved as SkillSort;
  } catch {
    /* unreadable or blocked storage: the default order */
  }
  return "name";
}

export function saveSkillSort(sort: SkillSort): void {
  try {
    window.localStorage.setItem(SORT_KEY, sort);
  } catch {
    /* a convenience only */
  }
}
