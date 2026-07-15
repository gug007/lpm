import type { DailyUsage } from "../../types";
import { formatTokenCount } from "../../agentUsageFormat";

export type ChartMode = "volume" | "share";

export interface ProviderFilter {
  claude: boolean;
  codex: boolean;
}

export function niceMax(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(max)));
  const fraction = max / power;
  const step = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return step * power;
}

export interface ChartTick {
  value: number;
  label: string;
  frac: number;
}

export function niceTicks(niceMaxValue: number, mode: ChartMode): ChartTick[] {
  const fracs = [0, 0.5, 1];
  return fracs.map((frac) => {
    const value = niceMaxValue * frac;
    const label =
      mode === "share" ? `${Math.round(frac * 100)}%` : frac === 0 ? "0" : formatTokenCount(value);
    return { value, label, frac };
  });
}

export interface StackFractions {
  claude: number;
  codex: number;
}

export function stackSegments(
  day: DailyUsage,
  mode: ChartMode,
  niceMaxValue: number,
): StackFractions {
  if (mode === "share") {
    const total = day.claudeTokens + day.codexTokens;
    if (total <= 0) return { claude: 0, codex: 0 };
    return { claude: day.claudeTokens / total, codex: day.codexTokens / total };
  }
  const denom = Math.max(1, niceMaxValue);
  return { claude: day.claudeTokens / denom, codex: day.codexTokens / denom };
}

export function nearestIndex(
  pointerX: number,
  plotLeft: number,
  plotWidth: number,
  count: number,
): number {
  if (count <= 1 || plotWidth <= 0) return 0;
  const relative = (pointerX - plotLeft) / plotWidth;
  const index = Math.floor(relative * count);
  return Math.min(count - 1, Math.max(0, index));
}

export interface VisibleDaily {
  days: DailyUsage[];
  max: number;
  total: number;
}

export function visibleDaily(daily: DailyUsage[], filter: ProviderFilter): VisibleDaily {
  let max = 0;
  let total = 0;
  const days = daily.map((day) => {
    const claudeTokens = filter.claude ? day.claudeTokens : 0;
    const codexTokens = filter.codex ? day.codexTokens : 0;
    const totalTokens = claudeTokens + codexTokens;
    max = Math.max(max, totalTokens);
    total += totalTokens;
    return { date: day.date, claudeTokens, codexTokens, totalTokens };
  });
  return { days, max, total };
}
