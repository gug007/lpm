import { CLAUDE_DOT, CODEX_DOT } from "./page-styles";

export type Provider = "claude" | "codex";
export type Period = 1 | 7 | 30 | 0;
export type ModelId = keyof typeof RATES;

export const PROVIDERS: readonly Provider[] = ["claude", "codex"];

export const PERIODS: readonly { value: Period; label: string }[] = [
  { value: 1, label: "Today" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 0, label: "All time" },
];

export const PROVIDER_META: Record<
  Provider,
  { label: string; short: string; color: string }
> = {
  claude: { label: "Claude Code", short: "Claude", color: CLAUDE_DOT },
  codex: { label: "Codex", short: "Codex", color: CODEX_DOT },
};

export const HISTORY_DAYS = 42;

export const CLAUDE_M = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 15.2, 0, 18.4, 22.1, 0, 26.7, 31.2, 24.9,
  12.3, 0, 28.6, 35.4, 30.2, 19.8, 14.1, 0, 33.9, 41.7, 48.2, 37.5, 22.6, 0,
  29.3, 36.8, 44.1, 39.6, 27.2, 0, 31.5, 16.4,
];

export const CODEX_M = [
  6.2, 8.1, 0, 7.4, 9.8, 5.1, 0, 6.9, 11.2, 8.4, 0, 4.3, 4.1, 0, 5.6, 7.9, 0,
  9.2, 12.4, 8.8, 3.1, 0, 10.6, 13.1, 11.4, 6.2, 4.8, 0, 12.7, 15.9, 18.3, 14.2,
  7.9, 0, 11.8, 14.6, 19.2, 16.1, 9.4, 0, 13.3, 6.8,
];

export type Mix = {
  fresh: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
  reasoning: number;
};

export const MIX: Record<Provider, Mix> = {
  claude: { fresh: 0.012, cacheWrite: 0.034, cacheRead: 0.939, output: 0.015, reasoning: 0 },
  codex: { fresh: 0.118, cacheWrite: 0, cacheRead: 0.852, output: 0.03, reasoning: 0.012 },
};

export const MODEL_SPLIT: Record<Provider, readonly (readonly [ModelId, number])[]> = {
  claude: [
    ["claude-fable-5", 0.74],
    ["claude-haiku-4-5", 0.26],
  ],
  codex: [
    ["gpt-5.4", 0.81],
    ["gpt-5.4-mini", 0.19],
  ],
};

export const RATES = {
  "claude-fable-5": [10, 12.5, 1, 50],
  "claude-haiku-4-5": [1, 1.25, 0.1, 5],
  "gpt-5.4": [2.5, 2.5, 0.25, 15],
  "gpt-5.4-mini": [0.75, 0.75, 0.075, 4.5],
} as const;

export const SESSION_DIVISOR: Record<Provider, number> = { claude: 2.6, codex: 2.2 };

export const PROJECTS = [
  ["saas-app", 0.27, 0.19],
  ["auth-service", 0.18, 0.14],
  ["ml-pipeline", 0.14, 0.06],
  ["docs-site", 0.09, 0.16],
  ["saas-app-k3Fq9Z", 0.08, 0.05],
  ["mobile-app", 0.07, 0.11],
  ["billing-worker", 0.06, 0.08],
  ["design-system", 0.04, 0.07],
  ["infra", 0.03, 0.06],
  ["marketing-site", 0.02, 0.05],
  ["cli-tools", 0.02, 0.03],
] as const;

export type SampleSession = {
  provider: Provider;
  project: string;
  model: ModelId;
  minutes: number;
  minutesAgo: number;
  m: number;
};

export const SESSIONS: readonly SampleSession[] = [
  { provider: "claude", project: "saas-app", model: "claude-fable-5", minutes: 42, minutesAgo: 6, m: 4.52 },
  { provider: "codex", project: "ml-pipeline", model: "gpt-5.4", minutes: 38, minutesAgo: 22, m: 3.3 },
  { provider: "claude", project: "docs-site", model: "claude-haiku-4-5", minutes: 7, minutesAgo: 48, m: 1.7 },
  { provider: "claude", project: "auth-service", model: "claude-fable-5", minutes: 95, minutesAgo: 75, m: 3.11 },
  { provider: "codex", project: "saas-app-k3Fq9Z", model: "gpt-5.4-mini", minutes: 11, minutesAgo: 110, m: 1.24 },
  { provider: "claude", project: "mobile-app", model: "claude-fable-5", minutes: 18, minutesAgo: 160, m: 1.13 },
  { provider: "claude", project: "saas-app", model: "claude-fable-5", minutes: 64, minutesAgo: 215, m: 3.68 },
  { provider: "codex", project: "billing-worker", model: "gpt-5.4", minutes: 26, minutesAgo: 290, m: 2.27 },
  { provider: "claude", project: "design-system", model: "claude-haiku-4-5", minutes: 3, minutesAgo: 380, m: 2.26 },
  { provider: "claude", project: "auth-service", model: "claude-fable-5", minutes: 150, minutesAgo: 1500, m: 5.84 },
  { provider: "codex", project: "ml-pipeline", model: "gpt-5.4", minutes: 47, minutesAgo: 1590, m: 4.1 },
  { provider: "claude", project: "infra", model: "claude-haiku-4-5", minutes: 12, minutesAgo: 1710, m: 1.95 },
];

export const TODAY_SESSION_COUNT = 9;

export const FILES_SCANNED = 1284;
