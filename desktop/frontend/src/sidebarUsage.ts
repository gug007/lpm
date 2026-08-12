import { providerMeta } from "./agentStatus";
import { formatTokenCount } from "./agentUsageFormat";
import { STALE_MS, barColor, fmtPct, resetDurationShort } from "./components/stats/limitsFormat";
import type { AgentLimitsMap, LimitWindow, ProviderLimits } from "./hooks/useAgentLimits";
import type { AgentUsageStats } from "./types";

export type UsageWindowChoice = "fiveHour" | "weekly" | "higher";

export const USAGE_TOOLS = ["claude", "codex"];
// The weekly window is the one that actually runs out on people — the 5-hour
// window refills on its own before most sessions end.
export const DEFAULT_USAGE_WINDOW: UsageWindowChoice = "weekly";

export interface UsageRow {
  provider: string;
  label: string;
  /** Dot colour — the tool's own, so a row is identifiable before it is read. */
  color: string;
  /** Bar colour: the limit palette when a window is known, the tool's own
   *  colour when the row is only reporting what it spent. */
  fill: string;
  fraction: number;
  /** Trailing line: when the window resets, or the day's spend when no window
   *  has been reported for that tool yet. */
  detail: string;
  /** How much of the window is gone, empty for a row with no window. */
  percentText: string;
  windowLabel: string;
  percent: number | null;
  tokens: number;
  sessions: number;
  fiveHour?: LimitWindow;
  weekly?: LimitWindow;
  /** The snapshot behind the row, for views that render the full card. */
  data?: ProviderLimits;
  updatedAt: number;
  stale: boolean;
}

// Claude reports one snapshot per account; the sidebar has room for one row, so
// the most recent reading wins.
function pickLatest(map: AgentLimitsMap, provider: string): ProviderLimits | undefined {
  let best: ProviderLimits | undefined;
  for (const entry of Object.values(map ?? {})) {
    if (entry.provider !== provider) continue;
    if (!best || entry.updatedAt > best.updatedAt) best = entry;
  }
  return best;
}

function pickWindow(
  data: ProviderLimits | undefined,
  choice: UsageWindowChoice,
): { win?: LimitWindow; label: string } {
  if (!data) return { win: undefined, label: "" };
  const { fiveHour, weekly } = data;
  if (choice === "weekly") {
    return weekly ? { win: weekly, label: "weekly" } : { win: fiveHour, label: "5-hour" };
  }
  if (choice === "higher") {
    if (fiveHour && weekly) {
      return weekly.usedPercent > fiveHour.usedPercent
        ? { win: weekly, label: "weekly" }
        : { win: fiveHour, label: "5-hour" };
    }
    return fiveHour ? { win: fiveHour, label: "5-hour" } : { win: weekly, label: "weekly" };
  }
  return fiveHour ? { win: fiveHour, label: "5-hour" } : { win: weekly, label: "weekly" };
}

function spend(stats: AgentUsageStats | null | undefined, provider: string) {
  const entry = (stats?.providers ?? []).find((row) => row.key === provider);
  return { tokens: entry?.tokens.totalTokens ?? 0, sessions: entry?.sessions ?? 0 };
}

export interface UsageRowOptions {
  tools?: string[];
  window?: UsageWindowChoice;
}

/** One row per agent CLI, in a fixed order so rows never swap places under the
 *  pointer. A tool appears once it has a usage window or has spent something
 *  today; tools that have done neither stay out of the sidebar entirely. */
export function usageRows(
  limits: AgentLimitsMap,
  stats: AgentUsageStats | null | undefined,
  now: number,
  options: UsageRowOptions = {},
): UsageRow[] {
  const tools = options.tools ?? USAGE_TOOLS;
  const choice = options.window ?? DEFAULT_USAGE_WINDOW;

  const candidates = USAGE_TOOLS.filter((provider) => tools.includes(provider))
    .map((provider) => {
      const data = pickLatest(limits, provider);
      return { provider, data, ...pickWindow(data, choice), ...spend(stats, provider) };
    })
    .filter((row) => row.win || row.tokens > 0);

  // Rows without a window are measured against each other, since no plan
  // publishes a token budget to measure them against.
  const peak = Math.max(0, ...candidates.filter((row) => !row.win).map((row) => row.tokens));

  return candidates.map((row) => {
    const meta = providerMeta(row.provider);
    const win = row.win;
    return {
      provider: row.provider,
      label: meta.short,
      color: meta.color,
      fill: win ? barColor(win.usedPercent) : meta.color,
      fraction: win
        ? Math.max(0, Math.min(100, win.usedPercent)) / 100
        : peak > 0
          ? row.tokens / peak
          : 0,
      // Just the duration — "resets in" costs half the row and the hover card
      // spells it out anyway. The day's spend keeps its unit, which is the word
      // that makes it a token count rather than a countdown.
      detail: win ? resetDurationShort(win.resetsAt, now) : `${formatTokenCount(row.tokens)} today`,
      percentText: win ? fmtPct(win.usedPercent) : "",
      windowLabel: win ? row.label : "",
      percent: win ? win.usedPercent : null,
      tokens: row.tokens,
      sessions: row.sessions,
      fiveHour: row.data?.fiveHour,
      weekly: row.data?.weekly,
      data: row.data,
      updatedAt: row.data?.updatedAt ?? 0,
      stale: !!row.data && now - row.data.updatedAt > STALE_MS,
    };
  });
}

export function tokensToday(stats: AgentUsageStats | null | undefined): number {
  return USAGE_TOOLS.reduce((sum, provider) => sum + spend(stats, provider).tokens, 0);
}
