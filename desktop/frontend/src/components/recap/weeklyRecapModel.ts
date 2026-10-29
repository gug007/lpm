import { formatTokenCount } from "../../agentUsageFormat";
import { addDays, localDate, monthKey, monthName, rangeLabel, weekStart } from "../stats/statsDates";
import { RECAP_HOURS_LABEL, RECAP_MONTH_TITLE, RECAP_TITLE, RECAP_TOKENS_LABEL } from "./recapCardTheme";

export interface RecapDay {
  date: string;
  agentMs: number;
  prompts: number;
  tokens: number;
}

/** Agent time on one project, or by one agent. */
export interface RecapTime {
  name: string;
  agentMs: number;
}

export type RecapPeriod = "week" | "month";

/** One week or month of agent work on this computer and every connected one. */
export interface WeeklyRecap {
  // The first day: a Monday, or the 1st of the month.
  week: string;
  // Missing from a computer older than months.
  period?: RecapPeriod;
  days: RecapDay[];
  previousAgentMs: number;
  sessions: number;
  projects: RecapTime[];
  agents: RecapTime[];
  workedRepos: string[];
  linesAdded: number;
  linesRemoved: number;
  // Paired computers that couldn't add their week.
  missing?: string[];
}

export type RecapWeek = "last" | "this";

// Monday to Wednesday: the start of a week, while last week is still news.
export const RECAP_NEWS_DAYS = 3;

export interface MixSlice {
  label: string;
  percent: number;
  color: string;
}

// What can be left off the card before it's shared; the hours always stay.
export const RECAP_ROWS = [
  "tokens",
  "prompts",
  "sessions",
  "lines",
  "agents",
] as const;
export type RecapRow = (typeof RECAP_ROWS)[number];

export function normalizeRecapRows(value: unknown): RecapRow[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = RECAP_ROWS.filter((row) => value.includes(row));
  return rows.length > 0 ? rows : undefined;
}

export interface RecapTile {
  id: RecapRow;
  value: string;
  label: string;
}

export interface RecapView {
  title: string;
  range: string;
  hours: string;
  // Leads the card when the week has any.
  tokens?: string;
  tiles: RecapTile[];
  lines?: { added: string; removed: string };
  mix: MixSlice[];
  // Each day's agent time against the week's busiest day, 0 to 1.
  days: { letter: string; on: boolean; level: number }[];
  empty: boolean;
}

const MINUTE = 60_000;
const AGENTS: Record<string, { label: string; color: string }> = {
  claude: { label: "Claude", color: "#de8a68" },
  codex: { label: "Codex", color: "#2dd4bf" },
};
const OTHER_COLORS = ["#c084fc", "#60a5fa", "#fbbf24"];

/** The Monday a recap of `which` week starts on. */
export function recapWeekStart(which: RecapWeek, today = localDate()): string {
  const current = weekStart(today);
  return which === "this" ? current : addDays(current, -7);
}

const monthStart = (date: string) => `${date.slice(0, 8)}01`;

/** The first day of the recap of `which` week or month. */
export function recapStart(which: RecapWeek, period: RecapPeriod, today = localDate()): string {
  if (period === "week") return recapWeekStart(which, today);
  const current = monthStart(today);
  return which === "this" ? current : monthStart(addDays(current, -1));
}

/** Every day of the week or month starting `first`. */
export function recapDates(first: string, period: RecapPeriod): string[] {
  const dates = [first];
  for (let day = addDays(first, 1); ; day = addDays(day, 1)) {
    if (period === "week" ? dates.length === 7 : monthKey(day) !== monthKey(first)) return dates;
    dates.push(day);
  }
}

export function recapRangeLabel(first: string, period: RecapPeriod): string {
  return period === "month" ? monthName(first, true) : weekRangeLabel(first);
}

export function recapTitle(period: RecapPeriod): string {
  return period === "month" ? RECAP_MONTH_TITLE : RECAP_TITLE;
}

export function weekRangeLabel(first: string): string {
  const last = addDays(first, 6);
  const at = (date: string) => new Date(`${date}T12:00:00`);
  const format = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
  return typeof format.formatRange === "function"
    ? format.formatRange(at(first), at(last))
    : rangeLabel(first, last);
}

export function formatAgentTime(ms: number): string {
  const minutes = Math.round(Math.max(0, ms) / MINUTE);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** Each agent's share of the agent time, Claude and Codex by name. */
export function agentMix(agents: RecapTime[]): MixSlice[] {
  const total = agents.reduce((sum, row) => sum + row.agentMs, 0);
  if (total <= 0) return [];
  let other = 0;
  return [...agents]
    .sort((a, b) => b.agentMs - a.agentMs)
    .map((row) => {
      const known = AGENTS[row.name];
      return {
        label: known?.label ?? row.name.charAt(0).toUpperCase() + row.name.slice(1),
        percent: (row.agentMs / total) * 100,
        color: known?.color ?? OTHER_COLORS[other++ % OTHER_COLORS.length],
      };
    })
    .filter((slice) => Math.round(slice.percent) > 0);
}

export function mixText(mix: MixSlice[]): string {
  if (mix.length === 1) return `All ${mix[0].label}`;
  return mix.map((slice) => `${slice.label} ${Math.round(slice.percent)}%`).join(", ");
}

function tile(id: RecapRow, count: number, one: string, many: string): RecapTile {
  return { id, value: count.toLocaleString(), label: count === 1 ? one : many };
}

const narrowWeekday = new Intl.DateTimeFormat(undefined, { weekday: "narrow" });

// Short enough for a quarter of the card.
function compactCount(count: number): string {
  if (count < 10_000) return count.toLocaleString();
  const thousands = Math.round(count / 1000);
  if (thousands < 1000) return `${thousands}k`;
  return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** What the card shows. */
export function recapView(recap: WeeklyRecap): RecapView {
  const agentMs = recap.days.reduce((sum, day) => sum + day.agentMs, 0);
  const prompts = recap.days.reduce((sum, day) => sum + day.prompts, 0);
  const tokens = recap.days.reduce((sum, day) => sum + day.tokens, 0);
  const on = recap.days.map((day) => day.agentMs > 0);
  const busiest = Math.max(0, ...recap.days.map((day) => day.agentMs));
  const period = recap.period ?? "week";
  return {
    title: recapTitle(period),
    range: recapRangeLabel(recap.week, period),
    hours: formatAgentTime(agentMs),
    tokens: tokens > 0 ? formatTokenCount(tokens) : undefined,
    tiles: [
      tile("prompts", prompts, "prompt", "prompts"),
      tile("sessions", recap.sessions, "agent session", "agent sessions"),
    ],
    lines: {
      added: `+${compactCount(recap.linesAdded)}`,
      removed: `−${compactCount(recap.linesRemoved)}`,
    },
    mix: agentMix(recap.agents),
    days: recap.days.map((day, i) => ({
      letter: narrowWeekday.format(new Date(`${day.date}T12:00:00`)),
      on: on[i],
      level: busiest > 0 ? Math.max(0, day.agentMs) / busiest : 0,
    })),
    empty: agentMs === 0,
  };
}

/** The card without the rows left `out`. */
export function withoutRows(view: RecapView, out: readonly RecapRow[]): RecapView {
  if (out.length === 0) return view;
  const hidden = new Set(out);
  return {
    ...view,
    tokens: hidden.has("tokens") ? undefined : view.tokens,
    tiles: view.tiles.filter((tile) => !hidden.has(tile.id)),
    lines: hidden.has("lines") ? undefined : view.lines,
    mix: hidden.has("agents") ? [] : view.mix,
  };
}

/** The words that go with the card's link when it's posted: only what the
 *  card itself shows. */
export function recapCaption(view: RecapView): string {
  const counts = view.tiles
    .filter((tile) => tile.id === "prompts")
    .map((tile) => `${tile.value} ${tile.label}`);
  const tokens = view.tokens ? [`${view.tokens} ${RECAP_TOKENS_LABEL}`] : [];
  return `${view.title} in lpm: ${[...tokens, `${view.hours} ${RECAP_HOURS_LABEL}`, ...counts].join(", ")}.`;
}
