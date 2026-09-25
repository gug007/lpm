const LOCALE = "en-US";

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function formatTokenCount(value: number): string {
  if (value < 1_000) return Math.round(value).toLocaleString(LOCALE);
  if (value < 1_000_000) return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}K`;
  if (value < 1_000_000_000)
    return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)}M`;
  return `${(value / 1_000_000_000).toFixed(value < 10_000_000_000 ? 1 : 0)}B`;
}

function trimDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, ms) / 1000;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3_600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${trimDecimal(seconds / 3_600)}h`;
  const days = seconds / 86_400;
  return days < 10 ? `${trimDecimal(days)}d` : `${Math.round(days)}d`;
}

export function formatPercent(frac: number, dp = 0): string {
  if (!Number.isFinite(frac)) return "0%";
  return `${(frac * 100).toFixed(dp)}%`;
}

export function formatUsd(value: number): string {
  if (value <= 0) return "$0";
  if (value < 10) return `$${value.toFixed(2)}`;
  return `$${Math.round(value).toLocaleString(LOCALE)}`;
}

export function formatCount(value: number): string {
  return value.toLocaleString(LOCALE);
}

export function relativeShort(minutesAgo: number): string {
  const s = Math.max(0, minutesAgo * 60);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  if (s < 2592000) return `${Math.floor(s / 604800)}w`;
  if (s < 31536000) return `${Math.floor(s / 2592000)}mo`;
  return `${Math.floor(s / 31536000)}y`;
}

export function dayLabel(ago: number, now: number | null): string {
  if (now !== null) {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - ago);
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
  }
  if (ago === 0) return "today";
  if (ago === 1) return "yesterday";
  return `${ago}d ago`;
}

export function fullTimestamp(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(ms),
  );
}

const SPOKEN_UNIT: Record<string, string> = { K: " thousand", M: " million", B: " billion" };

export function spokenTokens(value: number): string {
  return formatTokenCount(value).replace(/[KMB]$/, (unit) => SPOKEN_UNIT[unit]);
}

export function spokenPercent(frac: number): string {
  return `${formatPercent(frac).slice(0, -1)} percent`;
}

export const minutesToMs = (minutes: number) => minutes * 60_000;
