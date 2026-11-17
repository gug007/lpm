import type { AgentSessionUsage, DailyUsage, TokenUsage } from "../../types";

export { providerMeta, type ProviderMeta } from "../../agentStatus";

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

export function providerShare(tokens: number, total: number): number {
  return tokens / Math.max(1, total);
}

// The row already names the agent, so a model's own "claude-" prefix only
// crowds out the part that tells one model from another.
export function shortModelName(model: string): string {
  return model.replace(/^claude-/i, "");
}
