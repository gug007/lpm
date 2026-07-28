import type { DailyModelUsage, TokenUsage, UsageBreakdown } from "../../types";

export interface Rate {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

const OPUS_RATE: Rate = { input: 5, cacheWrite: 6.25, cacheRead: 0.5, output: 25 };
const GPT_FLAGSHIP_RATE: Rate = { input: 5, cacheWrite: 6.25, cacheRead: 0.5, output: 30 };

// Entries are substring tests matched in order, so a variant has to precede the
// family it belongs to — `gpt-5.4-mini` would otherwise be priced as `gpt-5.4`.
const RATE_TABLE: { tokens: string[]; rate: Rate }[] = [
  { tokens: ["fable", "mythos"], rate: { input: 10, cacheWrite: 12.5, cacheRead: 1.0, output: 50 } },
  { tokens: ["opus"], rate: OPUS_RATE },
  { tokens: ["sonnet"], rate: { input: 3, cacheWrite: 3.75, cacheRead: 0.3, output: 15 } },
  { tokens: ["haiku"], rate: { input: 1, cacheWrite: 1.25, cacheRead: 0.1, output: 5 } },
  { tokens: ["-luna"], rate: { input: 1, cacheWrite: 1.25, cacheRead: 0.1, output: 6 } },
  { tokens: ["-terra"], rate: { input: 2.5, cacheWrite: 3.125, cacheRead: 0.25, output: 15 } },
  { tokens: ["-sol"], rate: GPT_FLAGSHIP_RATE },
  { tokens: ["gpt-5.6"], rate: GPT_FLAGSHIP_RATE },
  { tokens: ["gpt-5.5"], rate: { input: 5, cacheWrite: 5, cacheRead: 0.5, output: 30 } },
  {
    tokens: ["gpt-5.4-mini"],
    rate: { input: 0.75, cacheWrite: 0.75, cacheRead: 0.075, output: 4.5 },
  },
  { tokens: ["gpt-5.4"], rate: { input: 2.5, cacheWrite: 2.5, cacheRead: 0.25, output: 15 } },
  {
    tokens: ["gpt-5-", "gpt-5.1", "gpt-5.2", "gpt-5.3", "o3", "o4", "o1"],
    rate: { input: 1.25, cacheWrite: 1.25, cacheRead: 0.125, output: 10 },
  },
];

export function pickRate(modelId: string, provider?: string): Rate {
  const id = modelId.toLowerCase();
  for (const entry of RATE_TABLE) {
    if (entry.tokens.some((token) => id.includes(token))) {
      return entry.rate;
    }
  }
  return provider === "codex" ? GPT_FLAGSHIP_RATE : OPUS_RATE;
}

export function estimateModelCost(tokens: TokenUsage, modelId: string, provider?: string): number {
  const rate = pickRate(modelId, provider);
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
    (sum, model) => sum + estimateModelCost(model.tokens, model.key, model.provider),
    0,
  );
}

export function estimateDailyCost(models: DailyModelUsage[], provider?: string): number {
  return (models ?? []).reduce(
    (sum, entry) =>
      provider && entry.provider !== provider
        ? sum
        : sum + estimateModelCost(entry.tokens, entry.model, entry.provider),
    0,
  );
}

export function formatUsd(value: number): string {
  if (value <= 0) return "$0";
  if (value < 10) return `$${value.toFixed(2)}`;
  return `$${Math.round(value).toLocaleString()}`;
}
