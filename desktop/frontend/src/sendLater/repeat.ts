import { DAY, HOUR, MINUTE } from "./time";

// How often a scheduled prompt can go out again, as Send later offers it.
export const REPEAT_CHOICES: readonly { ms: number; label: string }[] = [
  { ms: 0, label: "Once" },
  { ms: 30 * MINUTE, label: "Every 30 min" },
  { ms: HOUR, label: "Hourly" },
  { ms: DAY, label: "Daily" },
];

// "every 30 min", "every hour", "every day"; null for a prompt sent once.
export function repeatLabel(ms: number | undefined): string | null {
  if (!ms || ms <= 0) return null;
  if (ms % DAY === 0) return ms === DAY ? "every day" : `every ${ms / DAY} days`;
  if (ms % HOUR === 0) return ms === HOUR ? "every hour" : `every ${ms / HOUR} hours`;
  return `every ${Math.round(ms / MINUTE)} min`;
}

// `label` with ", then every hour" when the prompt repeats.
export function withRepeat(label: string, ms: number | undefined): string {
  const every = repeatLabel(ms);
  return every ? `${label}, then ${every}` : label;
}
