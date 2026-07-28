import { describe, expect, it } from "vitest";
import type { DailyModelUsage, TokenUsage, UsageBreakdown } from "../../types";
import { estimateDailyCost, estimateModelCost, estimateTotalCost, formatUsd } from "./statsCost";

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

function breakdown(
  key: string,
  tokenPart: Partial<TokenUsage>,
  provider?: string,
): UsageBreakdown {
  return { key, label: key, sessions: 1, tokens: tokens(tokenPart), provider };
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

  it("uses legacy OpenAI pricing for the gpt-5 generation", () => {
    const cost = estimateModelCost(
      tokens({ inputTokens: 1_000_000, outputTokens: 1_000_000 }),
      "gpt-5-codex",
    );
    expect(cost).toBeCloseTo(1.25 + 10, 6);
  });

  it("prices gpt-5.6 variants at their own tiers", () => {
    const usage = tokens({
      inputTokens: 2_000_000,
      cacheReadInputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(estimateModelCost(usage, "gpt-5.6-sol")).toBeCloseTo(5 + 0.5 + 30, 6);
    expect(estimateModelCost(usage, "gpt-5.6-terra")).toBeCloseTo(2.5 + 0.25 + 15, 6);
    expect(estimateModelCost(usage, "gpt-5.6-luna")).toBeCloseTo(1 + 0.1 + 6, 6);
  });

  it("prices a mini variant below its family", () => {
    const usage = tokens({ inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(estimateModelCost(usage, "gpt-5.4-mini")).toBeCloseTo(0.75 + 4.5, 6);
    expect(estimateModelCost(usage, "gpt-5.4")).toBeCloseTo(2.5 + 15, 6);
  });

  it("keeps an effort-suffixed variant on its family rate", () => {
    const cost = estimateModelCost(tokens({ outputTokens: 1_000_000 }), "gpt-5.6-sol-ultra");
    expect(cost).toBeCloseTo(30, 6);
  });

  it("falls back to the flagship gpt rate for unrecognized codex models", () => {
    const usage = tokens({ inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(estimateModelCost(usage, "codex-auto-review", "codex")).toBeCloseTo(5 + 30, 6);
    expect(estimateModelCost(usage, "Unknown model", "codex")).toBeCloseTo(5 + 30, 6);
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

  it("prices an unrecognized model by its provider, not the opus default", () => {
    const models: UsageBreakdown[] = [
      breakdown("codex-auto-review", { outputTokens: 1_000_000 }, "codex"),
    ];
    expect(estimateTotalCost(models)).toBeCloseTo(30, 6);
  });
});

describe("estimateDailyCost", () => {
  const models: DailyModelUsage[] = [
    { provider: "claude", model: "claude-opus-4-8", tokens: tokens({ outputTokens: 1_000_000 }) },
    { provider: "codex", model: "gpt-5-codex", tokens: tokens({ outputTokens: 1_000_000 }) },
  ];

  it("sums every provider by default", () => {
    expect(estimateDailyCost(models)).toBeCloseTo(25 + 10, 6);
  });

  it("restricts the sum to one provider", () => {
    expect(estimateDailyCost(models, "codex")).toBeCloseTo(10, 6);
  });

  it("treats a missing breakdown as free", () => {
    expect(estimateDailyCost([])).toBe(0);
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
