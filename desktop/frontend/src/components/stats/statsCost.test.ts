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
    expect(estimateModelCost(usage, "gpt-5.6-sol")).toBeCloseTo(4 + 0.4 + 20, 6);
    expect(estimateModelCost(usage, "gpt-5.6-terra")).toBeCloseTo(2 + 0.2 + 12, 6);
    expect(estimateModelCost(usage, "gpt-5.6-luna")).toBeCloseTo(0.2 + 0.02 + 1.2, 6);
  });

  it("prices a mini variant below its family", () => {
    const usage = tokens({ inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(estimateModelCost(usage, "gpt-5.4-mini")).toBeCloseTo(0.75 + 4.5, 6);
    expect(estimateModelCost(usage, "gpt-5.4")).toBeCloseTo(2.5 + 15, 6);
  });

  it("keeps an effort-suffixed variant on its family rate", () => {
    const cost = estimateModelCost(tokens({ outputTokens: 1_000_000 }), "gpt-5.6-sol-ultra");
    expect(cost).toBeCloseTo(20, 6);
  });

  it("falls back to the gpt-5.6 rate for unrecognized codex models", () => {
    const usage = tokens({ inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(estimateModelCost(usage, "gpt-reserve", "codex")).toBeCloseTo(4 + 20, 6);
    expect(estimateModelCost(usage, "Unknown model", "codex")).toBeCloseTo(4 + 20, 6);
  });

  it("prices the codex auto-reviewer as gpt-5.4", () => {
    const usage = tokens({ inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(estimateModelCost(usage, "codex-auto-review", "codex")).toBeCloseTo(2.5 + 15, 6);
  });

  it("prices opus 5.5 at its own rate rather than opus 5", () => {
    const usage = tokens({
      inputTokens: 3_000_000,
      cacheCreationInputTokens: 1_000_000,
      cacheReadInputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(estimateModelCost(usage, "claude-opus-5-5")).toBeCloseTo(4 + 5 + 0.2 + 20, 6);
    expect(estimateModelCost(usage, "claude-opus-5")).toBeCloseTo(5 + 6.25 + 0.5 + 25, 6);
  });

  it("prices fable 5.1 cache reads below fable 5", () => {
    const usage = tokens({ inputTokens: 1_000_000, cacheReadInputTokens: 1_000_000 });
    expect(estimateModelCost(usage, "claude-fable-5-1")).toBeCloseTo(0.25, 6);
    expect(estimateModelCost(usage, "claude-mythos-5-1")).toBeCloseTo(0.25, 6);
    expect(estimateModelCost(usage, "claude-fable-5")).toBeCloseTo(1, 6);
  });

  it("prices sonnet 5 below the sonnet 4 line", () => {
    const usage = tokens({ inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(estimateModelCost(usage, "claude-sonnet-5")).toBeCloseTo(2 + 10, 6);
    expect(estimateModelCost(usage, "claude-sonnet-4-6")).toBeCloseTo(3 + 15, 6);
    expect(estimateModelCost(usage, "claude-sonnet-4-5-20250929")).toBeCloseTo(3 + 15, 6);
  });

  it("keeps legacy claude models on their own rates", () => {
    const usage = tokens({ inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(estimateModelCost(usage, "claude-opus-4-1-20250805")).toBeCloseTo(15 + 75, 6);
    expect(estimateModelCost(usage, "claude-opus-4-20250514")).toBeCloseTo(15 + 75, 6);
    expect(estimateModelCost(usage, "claude-opus-4-5-20251101")).toBeCloseTo(5 + 25, 6);
    expect(estimateModelCost(usage, "claude-3-5-haiku-20241022")).toBeCloseTo(0.8 + 4, 6);
    expect(estimateModelCost(usage, "claude-haiku-4-5-20251001")).toBeCloseTo(1 + 5, 6);
  });

  it("prices one-hour cache writes at twice the input rate", () => {
    const cost = estimateModelCost(
      tokens({
        inputTokens: 1_000_000,
        cacheCreationInputTokens: 1_000_000,
        cacheCreation1hInputTokens: 600_000,
      }),
      "claude-opus-5",
    );
    expect(cost).toBeCloseTo(0.4 * 6.25 + 0.6 * 10, 6);
  });

  it("scales every bucket by the fast-mode multiplier", () => {
    const usage = tokens({
      inputTokens: 2_000_000,
      cacheReadInputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(estimateModelCost(usage, "claude-opus-5-5", "claude", true)).toBeCloseTo(
      2 * (4 + 0.2 + 20),
      6,
    );
    expect(estimateModelCost(usage, "claude-opus-4-6", "claude", true)).toBeCloseTo(
      6 * (5 + 0.5 + 25),
      6,
    );
    expect(estimateModelCost(usage, "gpt-5.5", "codex", true)).toBeCloseTo(
      2.5 * (5 + 0.5 + 30),
      6,
    );
  });

  it("prices gpt-6 models apart from their gpt-5.6 namesakes", () => {
    const usage = tokens({
      inputTokens: 2_000_000,
      cacheReadInputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(estimateModelCost(usage, "gpt-6-astra")).toBeCloseTo(10 + 1 + 50, 6);
    expect(estimateModelCost(usage, "gpt-6-sol")).toBeCloseTo(2 + 0.2 + 10, 6);
    expect(estimateModelCost(usage, "gpt-6-luna")).toBeCloseTo(0.1 + 0.01 + 0.5, 6);
  });

  it("keeps smaller and larger openai variants off their family rate", () => {
    const usage = tokens({ inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(estimateModelCost(usage, "gpt-5.4-nano")).toBeCloseTo(0.2 + 1.25, 6);
    expect(estimateModelCost(usage, "gpt-5.1-codex-mini")).toBeCloseTo(0.25 + 2, 6);
    expect(estimateModelCost(usage, "gpt-5.1-codex-max")).toBeCloseTo(1.25 + 10, 6);
    expect(estimateModelCost(usage, "gpt-5.2-codex")).toBeCloseTo(1.75 + 14, 6);
    expect(estimateModelCost(usage, "gpt-5.5-pro")).toBeCloseTo(30 + 180, 6);
    expect(estimateModelCost(usage, "gpt-5.6-cyber")).toBeCloseTo(12.5 + 75, 6);
    expect(estimateModelCost(usage, "o3-mini")).toBeCloseTo(1.1 + 4.4, 6);
    expect(estimateModelCost(usage, "o3")).toBeCloseTo(2 + 8, 6);
    expect(estimateModelCost(usage, "codex-mini-latest")).toBeCloseTo(1.5 + 6, 6);
  });

  it("charges the gpt-5.6 cache-write premium only where openai lists one", () => {
    const usage = tokens({ inputTokens: 1_000_000, cacheCreationInputTokens: 1_000_000 });
    expect(estimateModelCost(usage, "gpt-5.6-sol")).toBeCloseTo(5, 6);
    expect(estimateModelCost(usage, "gpt-5.4")).toBeCloseTo(2.5, 6);
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
      breakdown("gpt-reserve", { outputTokens: 1_000_000 }, "codex"),
    ];
    expect(estimateTotalCost(models)).toBeCloseTo(20, 6);
  });

  it("prices a fast-mode row at the fast rate", () => {
    const models: UsageBreakdown[] = [
      breakdown("claude-opus-5-5", { outputTokens: 1_000_000 }, "claude"),
      { ...breakdown("claude-opus-5-5", { outputTokens: 1_000_000 }, "claude"), fast: true },
    ];
    expect(estimateTotalCost(models)).toBeCloseTo(20 + 40, 6);
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

  it("prices a fast-mode entry at the fast rate", () => {
    const fast: DailyModelUsage[] = [
      {
        provider: "claude",
        model: "claude-opus-5",
        tokens: tokens({ outputTokens: 1_000_000 }),
        fast: true,
      },
    ];
    expect(estimateDailyCost(fast)).toBeCloseTo(50, 6);
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
