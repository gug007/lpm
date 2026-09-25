import { plural } from "./stats-format";

export const OVER_RATIO = 1.15;
export const UNDER_RATIO = 0.85;
export const MIN_ELAPSED_PERCENT = 5;

export type WindowKind = "fiveHour" | "weekly";
export type PaceVerdict = "early" | "under" | "on" | "over" | "exhausted";

export const WINDOW: Record<
  WindowKind,
  { label: "5-hour" | "Weekly"; short: string; spoken: string; minutes: number; step: number; max: number }
> = {
  fiveHour: { label: "5-hour", short: "5h", spoken: "5 hours", minutes: 300, step: 5, max: 295 },
  weekly: { label: "Weekly", short: "7d", spoken: "7 days", minutes: 10080, step: 60, max: 10020 },
};

export type Pace = {
  elapsedPercent: number;
  ratio: number;
  verdict: PaceVerdict;
  resetInMs: number;
  exhaustsInMs: number | null;
};

export function computePace(
  usedPercent: number,
  elapsedMinutes: number,
  windowMinutes: number,
): Pace {
  const windowMs = windowMinutes * 60000;
  const elapsedMs = Math.max(0, Math.min(windowMs, elapsedMinutes * 60000));
  const elapsedPercent = (elapsedMs / windowMs) * 100;
  const ratio = elapsedPercent > 0 ? usedPercent / elapsedPercent : 0;

  let verdict: PaceVerdict;
  if (usedPercent >= 100) verdict = "exhausted";
  else if (elapsedPercent < MIN_ELAPSED_PERCENT) verdict = "early";
  else if (ratio > OVER_RATIO) verdict = "over";
  else if (ratio < UNDER_RATIO) verdict = "under";
  else verdict = "on";

  const resetInMs = windowMs - elapsedMs;
  const rate = elapsedMs > 0 ? usedPercent / elapsedMs : 0;
  let exhaustsInMs: number | null = null;
  if (rate > 0 && usedPercent < 100) {
    const msToFull = (100 - usedPercent) / rate;
    if (Number.isFinite(msToFull) && msToFull < resetInMs) exhaustsInMs = msToFull;
  }

  return { elapsedPercent, ratio, verdict, resetInMs, exhaustsInMs };
}

export function paceLabel(verdict: PaceVerdict): string {
  switch (verdict) {
    case "over":
      return "ahead of pace";
    case "under":
      return "under pace";
    case "on":
      return "on pace";
    case "exhausted":
      return "limit reached";
    default:
      return "";
  }
}

export function showsTick(pace: Pace): boolean {
  return pace.verdict !== "early";
}

export function durationShort(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "now";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return rem ? `${hours}h ${rem}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH ? `${days}d ${remH}h` : `${days}d`;
}


export function durationSpoken(minutes: number): string {
  const mins = Math.max(0, Math.round(minutes));
  if (mins < 60) return plural(mins, "minute");
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return rem ? `${plural(hours, "hour")} ${plural(rem, "minute")}` : plural(hours, "hour");
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH ? `${plural(days, "day")} ${plural(remH, "hour")}` : plural(days, "day");
}

export function resetText(resetInMs: number): string {
  return resetInMs > 0 ? `resets in ${durationShort(resetInMs)}` : "resets now";
}

export function runsOutText(pace: Pace): string {
  return pace.verdict === "over" && pace.exhaustsInMs != null
    ? `runs out in ~${durationShort(pace.exhaustsInMs)}, before reset`
    : "";
}

export function barColor(pct: number): string {
  if (pct >= 95) return "var(--accent-red)";
  if (pct >= 80) return "var(--accent-amber)";
  return "var(--accent-cyan)";
}

export function verdictTone(verdict: PaceVerdict): string {
  if (verdict === "exhausted") return "text-[var(--accent-red)]";
  if (verdict === "over") return "text-[var(--accent-amber)]";
  return "text-[var(--text-muted)]";
}

export function meterValueText(used: number, pace: Pace): string {
  return [
    `${Math.round(used)}% used`,
    paceLabel(pace.verdict),
    showsTick(pace) ? `${Math.round(pace.elapsedPercent)}% of the window elapsed` : "",
    resetText(pace.resetInMs),
    runsOutText(pace),
  ]
    .filter(Boolean)
    .join(", ");
}

export function explainPace(pace: Pace, used: number): string {
  const e = Math.round(pace.elapsedPercent);
  const r = durationShort(pace.resetInMs);
  switch (pace.verdict) {
    case "early":
      return `Only ${Math.floor(pace.elapsedPercent)}% of the window has passed, so there's no verdict yet. lpm starts judging pace after the first 5%.`;
    case "under": {
      const p = Math.round((used / pace.elapsedPercent) * 100);
      return `You've used ${used}% with ${e}% of the window gone. At this rate you'd finish near ${p}% when it resets in ${r}.`;
    }
    case "on":
      return `You've used ${used}% with ${e}% of the window gone, roughly keeping pace with the clock. It resets in ${r}.`;
    case "over": {
      const runsOut = pace.exhaustsInMs ?? pace.resetInMs;
      return `You've used ${used}% with only ${e}% of the window gone. At this rate you run out in about ${durationShort(runsOut)}, ${durationShort(pace.resetInMs - runsOut)} before the reset.`;
    }
    case "exhausted":
      return `You've used the whole window. It resets in ${r}.`;
  }
}
