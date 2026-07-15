import type { TokenUsage, UsageBreakdown } from "../../types";

export interface Rate {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

const OPUS_RATE: Rate = { input: 5, cacheWrite: 6.25, cacheRead: 0.5, output: 25 };

const RATE_TABLE: { tokens: string[]; rate: Rate }[] = [
  { tokens: ["fable", "mythos"], rate: { input: 10, cacheWrite: 12.5, cacheRead: 1.0, output: 50 } },
  { tokens: ["opus"], rate: OPUS_RATE },
  { tokens: ["sonnet"], rate: { input: 3, cacheWrite: 3.75, cacheRead: 0.3, output: 15 } },
  { tokens: ["haiku"], rate: { input: 1, cacheWrite: 1.25, cacheRead: 0.1, output: 5 } },
  {
    tokens: ["gpt", "codex", "o3", "o4", "o1"],
    rate: { input: 1.25, cacheWrite: 1.25, cacheRead: 0.125, output: 10 },
  },
];

export function pickRate(modelId: string): Rate {
  const id = modelId.toLowerCase();
  for (const entry of RATE_TABLE) {
    if (entry.tokens.some((token) => id.includes(token))) {
      return entry.rate;
    }
  }
  return OPUS_RATE;
}

export function estimateModelCost(tokens: TokenUsage, modelId: string): number {
  const rate = pickRate(modelId);
  const freshInput = Math.max(
    0,
    tokens.inputTokens - tokens.cacheCreationInputTokens - tokens.cacheReadInputTokens,
  );
  const cost =
    freshInput * rate.input +
    tokens.cacheCreationInputTokens * rate.cacheWrite +
    tokens.cacheReadInputTokens * rate.cacheRead +
    tokens.outputTokens * rate.output;
  return cost / 1_000_000;
}

export function estimateTotalCost(models: UsageBreakdown[]): number {
  return (models ?? []).reduce(
    (sum, model) => sum + estimateModelCost(model.tokens, model.key),
    0,
  );
}

export function formatUsd(value: number): string {
  if (value <= 0) return "$0";
  if (value < 10) return `$${value.toFixed(2)}`;
  return `$${Math.round(value).toLocaleString()}`;
}
