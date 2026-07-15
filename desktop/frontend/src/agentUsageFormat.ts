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
