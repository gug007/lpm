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
    expect(rows[0].detail).toBe("2h");
    expect(rows[0].fraction).toBeCloseTo(0.34);
    expect(rows[0].percent).toBe(34);
  });

  it("reads the weekly window unless told otherwise", () => {
    const [claude] = usageRows(limits, null, NOW);
    expect(claude.windowLabel).toBe("weekly");
    expect(claude.percent).toBe(88);
    expect(claude.detail).toBe("1d 2h");
  });

  it("keeps the bar one calm colour however full the window is", () => {
    const [claude, codex] = usageRows(limits, null, NOW, { window: "fiveHour" });
    expect(claude.fill).toBe("var(--accent-cyan)");
    expect(codex.fill).toBe("var(--accent-cyan)");
  });

  it("marks where even use would put the window by now", () => {
    const HOUR = 60 * 60;
    const nowS = Math.floor(NOW / 1000);
    const [claude, codex] = usageRows(
      {
        claude: {
          provider: "claude",
          weekly: { usedPercent: 61, resetsAt: nowS + 41 * HOUR },
          updatedAt: NOW,
        },
        codex: {
          provider: "codex",
          weekly: { usedPercent: 51, resetsAt: nowS + 96 * HOUR },
          updatedAt: NOW,
        },
      },
      null,
      NOW,
    );
    expect(claude.pace).toBeCloseTo(127 / 168);
    expect(codex.pace).toBeCloseTo(72 / 168);
  });

  it("draws the tick from the very start of the window", () => {
    const HOUR = 60 * 60;
    const nowS = Math.floor(NOW / 1000);
    const [claude] = usageRows(
      {
        claude: {
          provider: "claude",
          weekly: { usedPercent: 23, resetsAt: nowS + 160 * HOUR },
          updatedAt: NOW,
        },
      },
      null,
      NOW,
    );
    expect(claude.pace).toBeCloseTo(8 / 168);
  });

  it("follows the chosen window", () => {
    const [fiveHour] = usageRows(limits, null, NOW, { window: "fiveHour" });
    expect(fiveHour.percent).toBe(34);
    expect(fiveHour.windowLabel).toBe("5-hour");

    const [higher] = usageRows(limits, null, NOW, { window: "higher" });
    expect(higher.percent).toBe(88);
  });

  it("draws the other window in the lower lane", () => {
    const [weekly] = usageRows(limits, null, NOW);
    expect(weekly.windowShort).toBe("");
    expect(weekly.lane).toEqual({ fraction: 0.34, fill: "var(--accent-cyan)" });
    expect(weekly.laneText).toBe("5-hour 34% used");

    const [fiveHour] = usageRows(limits, null, NOW, { window: "fiveHour" });
    expect(fiveHour.windowShort).toBe("5h");
    expect(fiveHour.lane?.fraction).toBeCloseTo(0.88);
    expect(fiveHour.lane?.fill).toBe("var(--accent-cyan)");
    expect(fiveHour.laneText).toBe("weekly 88% used");
  });

  it("keeps both lanes calm however full their windows are", () => {
    const [weekly, fiveHour] = usageRows(
      {
        claude: {
          provider: "claude",
          fiveHour: { usedPercent: 99, resetsAt: IN_TWO_HOURS },
          weekly: { usedPercent: 96, resetsAt: IN_TWO_HOURS + 86_400 },
          updatedAt: NOW,
        },
        codex: {
          provider: "codex",
          fiveHour: { usedPercent: 85, resetsAt: IN_TWO_HOURS },
          weekly: { usedPercent: 98, resetsAt: IN_TWO_HOURS + 86_400 },
          updatedAt: NOW,
        },
      },
      null,
      NOW,
    );
    expect(weekly.fill).toBe("var(--accent-cyan)");
    expect(weekly.lane?.fill).toBe("var(--accent-cyan)");
    expect(fiveHour.fill).toBe("var(--accent-cyan)");
    expect(fiveHour.lane?.fill).toBe("var(--accent-cyan)");
  });

  it("leaves the lower lane empty when the other window is missing", () => {
    const codex = usageRows(limits, null, NOW)[1];
    expect(codex.windowShort).toBe("5h");
    expect(codex.lane).toEqual({ fraction: 0, fill: "" });
    expect(codex.laneText).toBe("");
  });

  it("falls back to the other window when the chosen one is missing", () => {
    const rows = usageRows(limits, null, NOW, { window: "weekly" });
    expect(rows[1].percent).toBe(96);
    expect(rows[1].windowLabel).toBe("5-hour");
  });

  it("draws a plan without a 5-hour window as its weekly one alone", () => {
    const weeklyOnly: AgentLimitsMap = {
      codex: {
        provider: "codex",
        weekly: { usedPercent: 60, resetsAt: IN_TWO_HOURS + 86_400 },
        updatedAt: NOW - 60_000,
        noFiveHour: true,
      },
    };
    for (const window of ["fiveHour", "weekly", "higher"] as const) {
      const [row] = usageRows(weeklyOnly, null, NOW, { window });
      expect(row.windowLabel).toBe("weekly");
      expect(row.percentText).toBe("60%");
      expect(row.lane).toBeNull();
      expect(row.laneText).toBe("");
    }
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
    expect(claude.detail).toBe("1d 2h");
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
    expect(row.windowShort).toBe("");
    expect(row.lane).toBeNull();
  });

  it("drops a window that is already past its reset", () => {
    const past: AgentLimitsMap = {
      "claude:default": {
        provider: "claude",
        accountId: "default",
        fiveHour: { usedPercent: 55, resetsAt: Math.floor(NOW / 1000) - 60 },
        weekly: { usedPercent: 20, resetsAt: IN_TWO_HOURS },
        updatedAt: NOW,
      },
    };
    const [row] = usageRows(past, null, NOW, { window: "fiveHour" });
    expect(row.windowLabel).toBe("weekly");
    expect(row.percent).toBe(20);

    const onlyExpired = { "claude:default": { ...past["claude:default"], weekly: undefined } };
    expect(usageRows(onlyExpired, null, NOW)).toEqual([]);
  });
});

describe("usageRows with several Claude accounts", () => {
  const accounts = [
    { id: "acc-work", label: "Work", email: "work@example.com" },
    { id: "acc-home", label: "Home" },
  ];

  const twoAccounts: AgentLimitsMap = {
    "claude:acc-work": {
      provider: "claude",
      accountId: "acc-work",
      weekly: { usedPercent: 91, resetsAt: IN_TWO_HOURS },
      updatedAt: NOW - 1_000,
    },
    "claude:acc-home": {
      provider: "claude",
      accountId: "acc-home",
      weekly: { usedPercent: 12, resetsAt: IN_TWO_HOURS },
      updatedAt: NOW - 120_000,
    },
  };

  it("gives every account its own row instead of the newest reading winning", () => {
    const rows = usageRows(twoAccounts, null, NOW, { accounts });
    expect(rows.map((r) => r.label)).toEqual(["Work", "Home"]);
    expect(rows.map((r) => r.percent)).toEqual([91, 12]);
    expect(rows.map((r) => r.id)).toEqual(["claude:acc-work", "claude:acc-home"]);
    expect(rows.every((r) => r.provider === "claude")).toBe(true);
  });

  it("keeps a row for an account that has not run yet", () => {
    const oneReported = { "claude:acc-work": twoAccounts["claude:acc-work"] };
    const rows = usageRows(oneReported, null, NOW, { accounts });
    expect(rows.map((r) => r.label)).toEqual(["Work", "Home"]);
    expect(rows[1].detail).toBe("—");
    expect(rows[1].percentText).toBe("");
    expect(rows[1].fraction).toBe(0);
    expect(rows[1].data).toBeUndefined();
  });

  it("carries the account's email for the hover card", () => {
    const [work, home] = usageRows(twoAccounts, null, NOW, { accounts });
    expect(work.subtitle).toBe("work@example.com");
    expect(home.subtitle).toBeUndefined();
  });

  it("drops readings from accounts that are no longer registered", () => {
    const withRemoved: AgentLimitsMap = {
      ...twoAccounts,
      "claude:acc-removed": {
        provider: "claude",
        accountId: "acc-removed",
        weekly: { usedPercent: 2, resetsAt: IN_TWO_HOURS },
        updatedAt: NOW,
      },
    };
    expect(usageRows(withRemoved, null, NOW, { accounts }).map((r) => r.id)).toEqual([
      "claude:acc-work",
      "claude:acc-home",
    ]);
    const onlyRemoved = { "claude:acc-removed": withRemoved["claude:acc-removed"] };
    expect(usageRows(onlyRemoved, null, NOW).map((r) => r.id)).toEqual([]);
  });

  it("names the unpinned login after the tool and lists it after registered accounts", () => {
    const withDefault: AgentLimitsMap = {
      ...twoAccounts,
      "claude:default": {
        provider: "claude",
        accountId: "default",
        weekly: { usedPercent: 5, resetsAt: IN_TWO_HOURS },
        updatedAt: NOW,
      },
    };
    expect(usageRows(withDefault, null, NOW, { accounts }).map((r) => r.label)).toEqual([
      "Work",
      "Home",
      "Claude",
    ]);
  });

  it("keeps the tool's name when only one account is in play", () => {
    const single = { "claude:acc-work": twoAccounts["claude:acc-work"] };
    const [row] = usageRows(single, null, NOW, { accounts: [accounts[0]] });
    expect(row.label).toBe("Claude");
  });

  it("does not credit one account with the whole tool's spend", () => {
    const rows = usageRows(twoAccounts, stats([["claude", 2_000_000, 4]]), NOW, { accounts });
    expect(rows.map((r) => r.tokens)).toEqual([0, 0]);
    expect(rows.map((r) => r.sessions)).toEqual([0, 0]);
  });

  it("stays a single row until a Claude window has been reported", () => {
    const rows = usageRows({}, stats([["claude", 2_000_000]]), NOW, { accounts });
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("Claude");
    expect(rows[0].detail).toBe("2.0M today");
  });
});

describe("tokensToday", () => {
  it("adds up the agent CLIs and ignores anything else", () => {
    expect(tokensToday(stats([["claude", 700], ["codex", 300], ["gemini", 999]]))).toBe(1_000);
    expect(tokensToday(null)).toBe(0);
  });
});
