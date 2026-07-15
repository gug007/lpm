export function formatTokenCount(value: number): string {
  if (value < 1_000) return value.toLocaleString();
  if (value < 1_000_000) return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}K`;
  if (value < 1_000_000_000)
    return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)}M`;
  return `${(value / 1_000_000_000).toFixed(value < 10_000_000_000 ? 1 : 0)}B`;
}

export function usagePeriodLabel(days: number): string {
  if (days === 1) return "today";
  if (days === 0) return "all time";
  return `the last ${days} days`;
}

export function shortUsageDate(date: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(`${date}T12:00:00`),
  );
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
