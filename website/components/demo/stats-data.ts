export type StatsPeriod = 1 | 7 | 30 | 0;

export type DailyPoint = {
  /** Days back from today — 0 is today, so labels never go stale. */
  ago: number;
  claude: number;
  codex: number;
};

const CLAUDE_SERIES = [
  8.1, 12.4, 4.2, 0.9, 14.8, 17.2, 11.6, 9.4, 6.1, 1.2, 15.9, 21.3, 18.7, 13.2, 10.5, 3.4, 0.6,
  16.8, 19.4, 22.6, 12.9, 8.8, 2.1, 1.4, 17.5, 20.1, 15.3, 11.9, 18.2, 14.2,
];

const CODEX_SERIES = [
  3.2, 4.8, 1.1, 0.4, 5.6, 6.9, 4.4, 3.1, 2.2, 0.5, 6.2, 8.4, 7.1, 5.2, 3.8, 1.2, 0.3, 6.6, 7.8,
  9.1, 4.9, 3.3, 0.8, 0.6, 7.2, 8.1, 5.9, 4.6, 6.8, 8.4,
];

const MILLION = 1_000_000;

export const DAILY: DailyPoint[] = CLAUDE_SERIES.map((claude, index) => ({
  ago: CLAUDE_SERIES.length - 1 - index,
  claude: Math.round(claude * MILLION),
  codex: Math.round(CODEX_SERIES[index] * MILLION),
}));

// All time reaches back past the 30 days the chart holds, so its totals are
// scaled from the window rather than summed from it.
const ALL_TIME_FACTOR = 4.6;

const PROJECT_SHARES: { name: string; share: number }[] = [
  { name: "saas-app", share: 0.41 },
  { name: "auth-service", share: 0.27 },
  { name: "docs-site", share: 0.18 },
  { name: "ml-pipeline", share: 0.14 },
];

const MODEL_SHARES: { name: string; share: number }[] = [
  { name: "claude-opus-5", share: 0.46 },
  { name: "claude-sonnet-5", share: 0.22 },
  { name: "gpt-5-codex", share: 0.32 },
];

export type RecentSession = {
  project: string;
  model: string;
  tokens: number;
  when: string;
};

export const RECENT_SESSIONS: RecentSession[] = [
  { project: "saas-app", model: "claude-opus-5", tokens: 4_120_000, when: "14m ago" },
  { project: "auth-service", model: "gpt-5-codex", tokens: 2_640_000, when: "1h ago" },
  { project: "docs-site", model: "claude-sonnet-5", tokens: 980_000, when: "3h ago" },
  { project: "saas-app", model: "gpt-5-codex", tokens: 3_310_000, when: "yesterday" },
  { project: "ml-pipeline", model: "claude-opus-5", tokens: 5_870_000, when: "yesterday" },
];

export type StatsSlice = {
  daily: DailyPoint[];
  claude: number;
  codex: number;
  total: number;
  input: number;
  output: number;
  cacheShare: number;
  reasoningShare: number;
  sessions: number;
  projects: { name: string; tokens: number }[];
  models: { name: string; tokens: number }[];
  cost: number;
  peak: { tokens: number; ago: number } | null;
};

const COST_PER_MTOK = 1.15;

export function statsForPeriod(days: StatsPeriod): StatsSlice {
  const window = days === 0 ? DAILY : DAILY.slice(-days);
  const scale = days === 0 ? ALL_TIME_FACTOR : 1;
  const claude = Math.round(window.reduce((sum, day) => sum + day.claude, 0) * scale);
  const codex = Math.round(window.reduce((sum, day) => sum + day.codex, 0) * scale);
  const total = claude + codex;
  const peakDay = window.reduce<DailyPoint | null>(
    (best, day) => (!best || day.claude + day.codex > best.claude + best.codex ? day : best),
    null,
  );

  return {
    daily: window,
    claude,
    codex,
    total,
    input: Math.round(total * 0.82),
    output: Math.round(total * 0.18),
    cacheShare: 0.71,
    reasoningShare: 0.34,
    sessions: Math.max(1, Math.round((total / MILLION) * 0.42)),
    projects: PROJECT_SHARES.map((entry) => ({
      name: entry.name,
      tokens: Math.round(total * entry.share),
    })),
    models: MODEL_SHARES.map((entry) => ({
      name: entry.name,
      tokens: Math.round(total * entry.share),
    })),
    cost: (total / MILLION) * COST_PER_MTOK,
    peak: peakDay ? { tokens: peakDay.claude + peakDay.codex, ago: peakDay.ago } : null,
  };
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

export function formatUsd(value: number): string {
  return value >= 1000 ? `$${Math.round(value).toLocaleString()}` : `$${value.toFixed(0)}`;
}

export function agoLabel(ago: number): string {
  if (ago === 0) return "today";
  if (ago === 1) return "yesterday";
  return `${ago} days ago`;
}
