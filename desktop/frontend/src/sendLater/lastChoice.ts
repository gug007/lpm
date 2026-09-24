import { addDays, atClock, startOfDay } from "./time";

// The last time picked, remembered per viewer so Send later opens on it: as a
// delay when it was one ("in 2h"), as a clock time when it was one ("5:00 PM").
export type LastChoice = { kind: "delay"; ms: number } | { kind: "clock"; minutes: number };

const KEY = "lpm:send-later:last-choice:v1";
const DEFAULT_CHOICE: LastChoice = { kind: "delay", ms: 2 * 60 * 60 * 1000 };

export function loadLastChoice(): LastChoice {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    if (raw?.kind === "delay" && Number.isFinite(raw.ms) && raw.ms > 0) return raw;
    if (raw?.kind === "clock" && Number.isFinite(raw.minutes)) return raw;
  } catch {
    /* unreadable or blocked storage: fall back to the default */
  }
  return DEFAULT_CHOICE;
}

export function saveLastChoice(choice: LastChoice): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(choice));
  } catch {
    /* a convenience only */
  }
}

// The moment a remembered choice names from `now`: the same delay, or the next
// time the clock reads the same.
export function choiceAt(choice: LastChoice, now: number): number {
  if (choice.kind === "delay") return now + choice.ms;
  const today = atClock(startOfDay(now), 0, choice.minutes);
  return today > now ? today : addDays(today, 1);
}

export function clockChoice(at: number): LastChoice {
  const d = new Date(at);
  return { kind: "clock", minutes: d.getHours() * 60 + d.getMinutes() };
}
