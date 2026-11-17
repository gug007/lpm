import type { notes } from "../../../bridge/models";

export const TEXTAREA_MAX_HEIGHT_PX = 216;

export interface DayGroup {
  key: string;
  label: string;
  items: notes.Message[];
}

// Single pass: walk newest-first input from the tail to produce oldest-first
// groups, and format each day label exactly once (≈30 times for 500 messages
// instead of 500).
export function buildDayGroups(newestFirst: notes.Message[]): DayGroup[] {
  const groups: DayGroup[] = [];
  const now = new Date();
  for (let i = newestFirst.length - 1; i >= 0; i--) {
    const m = newestFirst[i];
    const d = new Date(m.ts);
    const key = d.toDateString();
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(m);
    } else {
      groups.push({ key, label: formatDayLabel(d, now), items: [m] });
    }
  }
  return groups;
}

export function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDayLabel(d: Date, now: Date) {
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "long" });
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatHitDate(ts: number) {
  const d = new Date(ts);
  return `${formatDayLabel(d, new Date())} · ${formatTime(ts)}`;
}
