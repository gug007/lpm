import type { AgentSessionUsage, DailyUsage, TokenUsage, UsageBreakdown } from "../../types";

export interface ProviderMeta {
  label: string;
  short: string;
  color: string;
}

const PROVIDER_META: Record<string, ProviderMeta> = {
  claude: { label: "Claude Code", short: "Claude", color: "#D97757" },
  codex: { label: "Codex", short: "Codex", color: "#10A37F" },
};

export function providerMeta(key: string): ProviderMeta {
  return PROVIDER_META[key] ?? { label: key, short: key, color: "var(--text-muted)" };
}

export function cacheShare(totals: TokenUsage): number {
  return totals.cachedInputTokens / Math.max(1, totals.inputTokens);
}

export function reasoningShare(totals: TokenUsage): number {
  return totals.reasoningTokens / Math.max(1, totals.outputTokens);
}

export function mostActiveDay(daily: DailyUsage[]): DailyUsage | null {
  let peak: DailyUsage | null = null;
  for (const day of daily) {
    if (day.totalTokens > 0 && (!peak || day.totalTokens > peak.totalTokens)) {
      peak = day;
    }
  }
  return peak;
}

export function distinctModelCount(sessions: AgentSessionUsage[]): number {
  return new Set(sessions.map((session) => session.model)).size;
}

export type TokenTypeKey = "input" | "cached" | "output" | "reasoning";

export interface TokenTypeSegment {
  key: TokenTypeKey;
  label: string;
  value: number;
  pct: number;
}

export function tokenTypeSegments(totals: TokenUsage): TokenTypeSegment[] {
  const values: Record<TokenTypeKey, number> = {
    input: Math.max(0, totals.inputTokens - totals.cachedInputTokens),
    cached: totals.cachedInputTokens,
    output: Math.max(0, totals.outputTokens - totals.reasoningTokens),
    reasoning: totals.reasoningTokens,
  };
  const sum = values.input + values.cached + values.output + values.reasoning;
  const labels: Record<TokenTypeKey, string> = {
    input: "Input",
    cached: "Cached",
    output: "Output",
    reasoning: "Reasoning",
  };
  return (Object.keys(values) as TokenTypeKey[]).map((key) => ({
    key,
    label: labels[key],
    value: values[key],
    pct: values[key] / Math.max(1, sum),
  }));
}

export type ProjectSortKey = "tokens" | "sessions" | "name";
export type SortDirection = "asc" | "desc";

export function sortProjects(
  projects: UsageBreakdown[],
  key: ProjectSortKey,
  direction: SortDirection,
  nameOf: (project: UsageBreakdown) => string = (project) => project.label,
): UsageBreakdown[] {
  return [...projects].sort((a, b) => {
    let primary: number;
    if (key === "name") {
      primary = nameOf(a).localeCompare(nameOf(b));
    } else if (key === "sessions") {
      primary = a.sessions - b.sessions;
    } else {
      primary = a.tokens.totalTokens - b.tokens.totalTokens;
    }
    if (primary !== 0) return direction === "asc" ? primary : -primary;
    return nameOf(a).localeCompare(nameOf(b));
  });
}

export function providerShare(tokens: number, total: number): number {
  return tokens / Math.max(1, total);
}

export function projectShare(tokens: number, max: number): number {
  return tokens / Math.max(1, max);
}
