import { describe, expect, it } from "vitest";
import type { TokenUsage, UsageBreakdown } from "../../types";
import { estimateModelCost, estimateTotalCost, formatUsd } from "./statsCost";

function tokens(partial: Partial<TokenUsage>): TokenUsage {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    ...partial,
  };
}

function breakdown(key: string, tokenPart: Partial<TokenUsage>): UsageBreakdown {
  return { key, label: key, sessions: 1, tokens: tokens(tokenPart) };
}

describe("estimateModelCost", () => {
  it("prices fresh input, cache writes, cache reads, and output for opus", () => {
    const cost = estimateModelCost(
      tokens({
        inputTokens: 3_000_000,
        cacheCreationInputTokens: 1_000_000,
        cacheReadInputTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
      "claude-opus-4-8",
    );
    expect(cost).toBeCloseTo(5 + 6.25 + 0.5 + 25, 6);
  });

  it("prices a fable model at the top-tier rate", () => {
    const cost = estimateModelCost(
      tokens({
        inputTokens: 2_000_000,
        cacheCreationInputTokens: 500_000,
        cacheReadInputTokens: 500_000,
        outputTokens: 1_000_000,
      }),
      "claude-fable-5",
    );
    expect(cost).toBeCloseTo(10 + 6.25 + 0.5 + 50, 6);
  });

  it("falls back to the opus-tier default for unknown models", () => {
    const cost = estimateModelCost(tokens({ inputTokens: 1_000_000 }), "some-mystery-model");
    expect(cost).toBeCloseTo(5, 6);
  });

  it("uses OpenAI-family pricing for gpt/codex models", () => {
    const cost = estimateModelCost(
      tokens({ inputTokens: 1_000_000, outputTokens: 1_000_000 }),
      "gpt-5-codex",
    );
    expect(cost).toBeCloseTo(1.25 + 10, 6);
  });

  it("never goes negative when cache exceeds input", () => {
    const cost = estimateModelCost(
      tokens({
        inputTokens: 1_000_000,
        cacheCreationInputTokens: 1_000_000,
        cacheReadInputTokens: 1_000_000,
      }),
      "claude-opus-4-8",
    );
    expect(cost).toBeGreaterThanOrEqual(0);
    expect(cost).toBeCloseTo(6.25 + 0.5, 6);
  });
});

describe("estimateTotalCost", () => {
  it("sums per-model estimates", () => {
    const models: UsageBreakdown[] = [
      breakdown("claude-opus-4-8", { outputTokens: 1_000_000 }),
      breakdown("gpt-5-codex", { outputTokens: 1_000_000 }),
    ];
    expect(estimateTotalCost(models)).toBeCloseTo(25 + 10, 6);
  });
});

describe("formatUsd", () => {
  it("shows cents under ten dollars", () => {
    expect(formatUsd(4.2)).toBe("$4.20");
  });

  it("rounds and groups larger amounts", () => {
    expect(formatUsd(2771.6)).toBe("$2,772");
  });

  it("collapses zero", () => {
    expect(formatUsd(0)).toBe("$0");
  });
});
