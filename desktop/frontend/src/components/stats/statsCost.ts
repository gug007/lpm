import type { DailyModelUsage, TokenUsage, UsageBreakdown } from "../../types";

export interface Rate {
  input: number;
  cacheWrite: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
  fast: number;
}

function anthropic(input: number, output: number, cacheRead = input * 0.1, fast = 2): Rate {
  return { input, cacheWrite: input * 1.25, cacheWrite1h: input * 2, cacheRead, output, fast };
}

// OpenAI bills a cache write as plain input unless the model lists a write rate, and has no
// 1-hour tier.
function openai(
  input: number,
  cacheRead: number,
  output: number,
  cacheWrite = input,
  fast = 2,
): Rate {
  return { input, cacheWrite, cacheWrite1h: cacheWrite, cacheRead, output, fast };
}

const OPUS_RATE = anthropic(5, 25);
const CODEX_RATE = openai(4, 0.4, 20, 5);

// Entries are substring tests matched in order, so a variant has to precede the
// family it belongs to — `claude-opus-5-5` would otherwise be priced as Opus 5.
const RATE_TABLE: { tokens: string[]; rate: Rate }[] = [
  { tokens: ["fable-5-1", "mythos-5-1"], rate: anthropic(10, 50, 0.25) },
  { tokens: ["mythos-preview"], rate: anthropic(25, 125) },
  { tokens: ["fable", "mythos"], rate: anthropic(10, 50) },
  { tokens: ["opus-5-5"], rate: anthropic(4, 20, 0.2) },
  { tokens: ["opus-4-6", "opus-4-7"], rate: anthropic(5, 25, 0.5, 6) },
  { tokens: ["opus-4-1", "opus-4-2025", "opus-4@"], rate: anthropic(15, 75) },
  { tokens: ["opus"], rate: OPUS_RATE },
  { tokens: ["sonnet-5"], rate: anthropic(2, 10) },
  { tokens: ["sonnet"], rate: anthropic(3, 15) },
  { tokens: ["3-5-haiku"], rate: anthropic(0.8, 4) },
  { tokens: ["haiku"], rate: anthropic(1, 5) },
  { tokens: ["gpt-6.1-sol"], rate: openai(2, 0.1, 10, 2.5) },
  { tokens: ["gpt-6-astra"], rate: openai(10, 1, 50, 12.5) },
  { tokens: ["gpt-6-sol"], rate: openai(2, 0.2, 10, 2.5) },
  { tokens: ["gpt-6-luna"], rate: openai(0.1, 0.01, 0.5, 0.125) },
  { tokens: ["gpt-5.6-terra"], rate: openai(2, 0.2, 12, 2.5) },
  { tokens: ["gpt-5.6-luna"], rate: openai(0.2, 0.02, 1.2, 0.25) },
  { tokens: ["gpt-5.6-cyber"], rate: openai(12.5, 1.25, 75, 15.625) },
  { tokens: ["gpt-5.6"], rate: CODEX_RATE },
  { tokens: ["gpt-5.5-pro"], rate: openai(30, 30, 180) },
  { tokens: ["gpt-5.5"], rate: openai(5, 0.5, 30, 5, 2.5) },
  { tokens: ["gpt-5.4-mini"], rate: openai(0.75, 0.075, 4.5) },
  { tokens: ["gpt-5.4-nano"], rate: openai(0.2, 0.02, 1.25) },
  { tokens: ["gpt-5.4", "codex-auto-review"], rate: openai(2.5, 0.25, 15) },
  { tokens: ["gpt-5.3", "gpt-5.2"], rate: openai(1.75, 0.175, 14) },
  { tokens: ["gpt-5-mini"], rate: openai(0.25, 0.025, 2, 0.25, 1.8) },
  { tokens: ["gpt-5-nano"], rate: openai(0.05, 0.005, 0.4) },
  { tokens: ["gpt-5.1-codex-mini", "gpt-5-codex-mini"], rate: openai(0.25, 0.025, 2) },
  { tokens: ["gpt-5"], rate: openai(1.25, 0.125, 10) },
  { tokens: ["codex-mini"], rate: openai(1.5, 0.375, 6) },
  { tokens: ["o4-mini"], rate: openai(1.1, 0.275, 4.4) },
  { tokens: ["o3-mini"], rate: openai(1.1, 0.55, 4.4) },
  { tokens: ["o3"], rate: openai(2, 0.5, 8, 2, 1.75) },
];

export function pickRate(modelId: string, provider?: string): Rate {
  const id = modelId.toLowerCase();
  for (const entry of RATE_TABLE) {
    if (entry.tokens.some((token) => id.includes(token))) {
      return entry.rate;
    }
  }
  return provider === "codex" ? CODEX_RATE : OPUS_RATE;
}

export function estimateModelCost(
  tokens: TokenUsage,
  modelId: string,
  provider?: string,
  fast?: boolean,
): number {
  const rate = pickRate(modelId, provider);
  const freshInput = Math.max(
    0,
    tokens.inputTokens - tokens.cacheCreationInputTokens - tokens.cacheReadInputTokens,
  );
  const cacheWrite1h = Math.min(
    tokens.cacheCreation1hInputTokens ?? 0,
    tokens.cacheCreationInputTokens,
  );
  const cost =
    freshInput * rate.input +
    (tokens.cacheCreationInputTokens - cacheWrite1h) * rate.cacheWrite +
    cacheWrite1h * rate.cacheWrite1h +
    tokens.cacheReadInputTokens * rate.cacheRead +
    tokens.outputTokens * rate.output;
  return (cost * (fast ? rate.fast : 1)) / 1_000_000;
}

export function estimateTotalCost(models: UsageBreakdown[]): number {
  return (models ?? []).reduce(
    (sum, model) =>
      sum + estimateModelCost(model.tokens, model.key, model.provider, model.fast),
    0,
  );
}

export function estimateDailyCost(models: DailyModelUsage[], provider?: string): number {
  return (models ?? []).reduce(
    (sum, entry) =>
      provider && entry.provider !== provider
        ? sum
        : sum + estimateModelCost(entry.tokens, entry.model, entry.provider, entry.fast),
    0,
  );
}

export function formatUsd(value: number): string {
  if (value <= 0) return "$0";
  if (value < 10) return `$${value.toFixed(2)}`;
  return `$${Math.round(value).toLocaleString()}`;
}
