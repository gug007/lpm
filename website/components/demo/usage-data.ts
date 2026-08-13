export type UsageToolKey = "claude" | "codex";

export type UsageWindowChoice = "fiveHour" | "weekly" | "higher";

export type UsageSidebarSettings = {
  enabled: boolean;
  tools: UsageToolKey[];
  window: UsageWindowChoice;
};

export type UsageWindowData = {
  usedPercent: number;
  /** Share of the window already gone — the tick mark on the meter. */
  elapsedPercent: number;
  resetIn: string;
  resetAt: string;
};

export type UsageProviderData = {
  key: UsageToolKey;
  label: string;
  color: string;
  plan: string;
  account?: string;
  updated: string;
  tokensToday: string;
  sessions: number;
  fiveHour: UsageWindowData;
  weekly: UsageWindowData;
};

export const DEFAULT_USAGE_SETTINGS: UsageSidebarSettings = {
  enabled: true,
  tools: ["claude", "codex"],
  window: "weekly",
};

export const USAGE_PROVIDERS: UsageProviderData[] = [
  {
    key: "claude",
    label: "Claude",
    color: "#D97757",
    plan: "Max 20x",
    account: "you@example.com",
    updated: "updated 2m ago",
    tokensToday: "14.2M",
    sessions: 9,
    fiveHour: {
      usedPercent: 41,
      elapsedPercent: 55,
      resetIn: "2h 14m",
      resetAt: "Aug 13, 12:15",
    },
    weekly: {
      usedPercent: 65,
      elapsedPercent: 89,
      resetIn: "18h 29m",
      resetAt: "Aug 14, 04:00",
    },
  },
  {
    key: "codex",
    label: "Codex",
    color: "#10A37F",
    plan: "Pro",
    updated: "updated 6m ago",
    tokensToday: "8.4M",
    sessions: 4,
    fiveHour: {
      usedPercent: 12,
      elapsedPercent: 8,
      resetIn: "4h 36m",
      resetAt: "Aug 13, 14:37",
    },
    weekly: {
      usedPercent: 1,
      elapsedPercent: 1,
      resetIn: "6d 23h",
      resetAt: "Aug 20, 09:00",
    },
  },
];

export const TOKENS_TODAY = "22.6M";

export function usageBarColor(usedPercent: number): string {
  if (usedPercent >= 95) return "#f87171";
  if (usedPercent >= 80) return "#fbbf24";
  return "#22d3ee";
}

export function pickUsageWindow(
  provider: UsageProviderData,
  choice: UsageWindowChoice,
): { win: UsageWindowData; label: string } {
  if (choice === "fiveHour") return { win: provider.fiveHour, label: "5-hour" };
  if (choice === "higher") {
    return provider.weekly.usedPercent > provider.fiveHour.usedPercent
      ? { win: provider.weekly, label: "weekly" }
      : { win: provider.fiveHour, label: "5-hour" };
  }
  return { win: provider.weekly, label: "weekly" };
}

// A raw "65% used" says nothing until it is read against how much of the window
// has burned down, so every meter is judged against elapsed wall-clock time.
export function usagePaceLabel(win: UsageWindowData): string {
  if (win.usedPercent >= 100) return "limit reached";
  if (win.elapsedPercent < 5) return "";
  const ratio = win.usedPercent / win.elapsedPercent;
  if (ratio > 1.15) return "ahead of pace";
  if (ratio < 0.85) return "under pace";
  return "on pace";
}

export function usagePaceColor(label: string): string {
  if (label === "limit reached") return "text-[#f87171]";
  if (label === "ahead of pace") return "text-[#fbbf24]";
  return "text-[#919191]";
}

export type SidebarUsageRow = {
  key: UsageToolKey;
  label: string;
  color: string;
  fill: string;
  detail: string;
  percentText: string;
  fraction: number;
  windowLabel: string;
};

/** One row per tool, in a fixed order so rows never swap under the pointer. */
export function sidebarUsageRows(settings: UsageSidebarSettings): SidebarUsageRow[] {
  if (!settings.enabled) return [];
  return USAGE_PROVIDERS.filter((provider) => settings.tools.includes(provider.key)).map(
    (provider) => {
      const { win, label } = pickUsageWindow(provider, settings.window);
      return {
        key: provider.key,
        label: provider.label,
        color: provider.color,
        fill: usageBarColor(win.usedPercent),
        detail: win.resetIn,
        percentText: `${Math.round(win.usedPercent)}%`,
        fraction: Math.max(0, Math.min(100, win.usedPercent)) / 100,
        windowLabel: label,
      };
    },
  );
}
