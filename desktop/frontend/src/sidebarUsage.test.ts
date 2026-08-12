import { describe, expect, it } from "vitest";
import { tokensToday, usageRows } from "./sidebarUsage";
import type { AgentLimitsMap } from "./hooks/useAgentLimits";
import type { AgentUsageStats, TokenUsage, UsageBreakdown } from "./types";

const NOW = 1_800_000_000_000;
const IN_TWO_HOURS = Math.floor(NOW / 1000) + 2 * 60 * 60;

function tokens(total: number): TokenUsage {
  return {
    inputTokens: total,
    cachedInputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: total,
  };
}

function stats(entries: [string, number, number?][]): AgentUsageStats {
  const providers: UsageBreakdown[] = entries.map(([key, total, sessions = 1]) => ({
    key,
    label: key,
    sessions,
    tokens: tokens(total),
  }));
  return {
    generatedAt: 0,
    days: 1,
    sessions: providers.length,
    totals: tokens(entries.reduce((sum, [, total]) => sum + total, 0)),
    providers,
    projects: [],
    models: [],
    daily: [],
    recentSessions: [],
    sources: [],
  };
}

const limits: AgentLimitsMap = {
  claude: {
    provider: "claude",
    fiveHour: { usedPercent: 34, resetsAt: IN_TWO_HOURS },
    weekly: { usedPercent: 88, resetsAt: IN_TWO_HOURS + 86_400 },
    updatedAt: NOW - 60_000,
  },
  codex: {
    provider: "codex",
    fiveHour: { usedPercent: 96, resetsAt: IN_TWO_HOURS },
    updatedAt: NOW - 60_000,
  },
};

describe("usageRows", () => {
  it("leads with when the window resets", () => {
    const rows = usageRows(limits, null, NOW, { window: "fiveHour" });
    expect(rows.map((r) => r.provider)).toEqual(["claude", "codex"]);
    expect(rows[0].detail).toBe("resets in 2h");
    expect(rows[0].fraction).toBeCloseTo(0.34);
    expect(rows[0].percent).toBe(34);
  });

  it("reads the weekly window unless told otherwise", () => {
    const [claude] = usageRows(limits, null, NOW);
    expect(claude.windowLabel).toBe("weekly");
    expect(claude.percent).toBe(88);
    expect(claude.detail).toBe("resets in 1d 2h");
  });

  it("colours the bar by how much of the window is gone", () => {
    const [claude, codex] = usageRows(limits, null, NOW, { window: "fiveHour" });
    expect(claude.fill).toBe("var(--accent-cyan)");
    expect(codex.fill).toBe("var(--accent-red)");
  });

  it("follows the chosen window", () => {
    const [fiveHour] = usageRows(limits, null, NOW, { window: "fiveHour" });
    expect(fiveHour.percent).toBe(34);
    expect(fiveHour.windowLabel).toBe("5-hour");

    const [higher] = usageRows(limits, null, NOW, { window: "higher" });
    expect(higher.percent).toBe(88);
  });

  it("falls back to the other window when the chosen one is missing", () => {
    const rows = usageRows(limits, null, NOW, { window: "weekly" });
    expect(rows[1].percent).toBe(96);
    expect(rows[1].windowLabel).toBe("5-hour");
  });

  it("reports the day's spend for a tool with no window yet", () => {
    const rows = usageRows({}, stats([["claude", 2_000_000, 3]]), NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].detail).toBe("2.0M today");
    expect(rows[0].fraction).toBe(1);
    expect(rows[0].sessions).toBe(3);
  });

  it("scales window-less rows against each other", () => {
    const rows = usageRows({}, stats([["claude", 2_000_000], ["codex", 500_000]]), NOW);
    expect(rows.map((r) => r.fraction)).toEqual([1, 0.25]);
  });

  it("hides tools the user turned off", () => {
    const rows = usageRows(limits, null, NOW, { tools: ["codex"] });
    expect(rows.map((r) => r.provider)).toEqual(["codex"]);
    expect(usageRows(limits, null, NOW, { tools: [] })).toEqual([]);
  });

  it("keeps out tools with neither a window nor a run today", () => {
    expect(usageRows({}, stats([["codex", 0]]), NOW)).toEqual([]);
    expect(usageRows({}, null, NOW)).toEqual([]);
  });

  it("marks a snapshot older than fifteen minutes as stale", () => {
    const old: AgentLimitsMap = {
      codex: { ...limits.codex, updatedAt: NOW - 20 * 60_000 },
    };
    expect(usageRows(old, null, NOW)[0].stale).toBe(true);
    expect(usageRows(limits, null, NOW)[0].stale).toBe(false);
  });

  it("keeps the newest reading when one tool reports twice", () => {
    const twoAccounts: AgentLimitsMap = {
      old: {
        provider: "claude",
        fiveHour: { usedPercent: 10, resetsAt: IN_TWO_HOURS },
        updatedAt: NOW - 120_000,
      },
      fresh: {
        provider: "claude",
        fiveHour: { usedPercent: 70, resetsAt: IN_TWO_HOURS },
        updatedAt: NOW - 1_000,
      },
    };
    expect(usageRows(twoAccounts, null, NOW)[0].percent).toBe(70);
  });

  it("carries the percentage next to the reset time", () => {
    const [claude] = usageRows(limits, null, NOW);
    expect(claude.percentText).toBe("88%");
    expect(claude.detail).toBe("resets in 1d 2h");
  });

  it("leaves only the percentage when the reset time is unknown", () => {
    const noReset: AgentLimitsMap = {
      codex: {
        provider: "codex",
        fiveHour: { usedPercent: 42, resetsAt: 0 },
        updatedAt: NOW,
      },
    };
    const [row] = usageRows(noReset, null, NOW);
    expect(row.detail).toBe("");
    expect(row.percentText).toBe("42%");
  });

  it("has no percentage for a row that only knows the day's spend", () => {
    const [row] = usageRows({}, stats([["claude", 2_000_000]]), NOW);
    expect(row.percentText).toBe("");
    expect(row.detail).toBe("2.0M today");
  });
});

describe("tokensToday", () => {
  it("adds up the agent CLIs and ignores anything else", () => {
    expect(tokensToday(stats([["claude", 700], ["codex", 300], ["gemini", 999]]))).toBe(1_000);
    expect(tokensToday(null)).toBe(0);
  });
});
