import { visibleDay, type DayPoint } from "./stats-derive";
import { dayLabel, formatPercent, formatTokenCount, formatUsd } from "./stats-format";
import { PROVIDERS, PROVIDER_META, type Provider } from "./stats-sample-data";

export type ChartMode = "volume" | "share";

export const CHART_MODES: readonly { value: ChartMode; label: string }[] = [
  { value: "volume", label: "Volume" },
  { value: "share", label: "Share" },
];

export function niceMax(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(max)));
  const fraction = max / power;
  const step = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return step * power;
}

export function niceTicks(maxValue: number, mode: ChartMode) {
  return [0, 0.5, 1].map((frac) => ({
    frac,
    label:
      mode === "share"
        ? `${Math.round(frac * 100)}%`
        : frac === 0
          ? "0"
          : formatTokenCount(maxValue * frac),
  }));
}

export function stackFractions(
  claude: number,
  codex: number,
  mode: ChartMode,
  maxValue: number,
) {
  if (mode === "share") {
    const total = claude + codex;
    if (total <= 0) return { claude: 0, codex: 0 };
    return { claude: claude / total, codex: codex / total };
  }
  const denom = Math.max(1, maxValue);
  return { claude: claude / denom, codex: codex / denom };
}

export function nearestIndex(pointerX: number, left: number, width: number, count: number) {
  if (count <= 1 || width <= 0) return 0;
  const index = Math.floor(((pointerX - left) / width) * count);
  return Math.min(count - 1, Math.max(0, index));
}

export function barMaxWidth(count: number): number {
  if (count === 1) return 48;
  if (count <= 7) return 32;
  if (count <= 14) return 22;
  return 14;
}

export function describeDay(day: DayPoint, hidden: ReadonlySet<Provider>, now: number | null) {
  const visible = visibleDay(day, hidden);
  const parts = PROVIDERS.filter((provider) => !hidden.has(provider)).map((provider) => {
    const tokens = visible[provider];
    return `${PROVIDER_META[provider].short} ${formatTokenCount(tokens)}, ${formatUsd(
      day.cost[provider],
    )}, ${formatPercent(tokens / Math.max(1, visible.total))}`;
  });
  return `${dayLabel(day.ago, now)}: ${parts.join("; ")}. Total ${formatTokenCount(
    visible.total,
  )}, about ${formatUsd(visible.cost)}.`;
}
