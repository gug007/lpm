import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../bridge/commands", () => ({}));

import { accountLabel, skipChip, skipSentence } from "./claudePoolText";
import { useAccountsStore } from "./store/accounts";

const NOW = 1_800_000_000_000;

beforeEach(() => {
  useAccountsStore.setState({ accounts: [{ id: "work", label: "Work" }] });
});

describe("claudePoolText", () => {
  it("names the main login, registered accounts and removed ones", () => {
    expect(accountLabel("default")).toBe("Main login");
    expect(accountLabel("work")).toBe("Work");
    expect(accountLabel("gone")).toBe("Removed account");
  });

  it("says why an account near its limit was passed over", () => {
    const resetsAt = NOW / 1000 + 2 * 3600;
    expect(skipSentence("work", { kind: "near", window: "fiveHour", percent: 91.4, resetsAt }, null, NOW)).toBe(
      "Work is at 91% of its 5-hour limit, resets in 2h",
    );
    expect(skipSentence("default", { kind: "hit", window: "weekly", resetsAt }, null, NOW)).toBe(
      "Main login hit its weekly limit, resets in 2h",
    );
    expect(skipSentence("work", { kind: "sameAccount", as: "default" })).toBe(
      "Work is signed in as the same Claude account as Main login",
    );
  });

  it("gives each reason a short chip", () => {
    expect(skipChip({ kind: "onHold" }).tone).toBe("red");
    expect(skipChip({ kind: "near", window: "weekly", percent: 95, resetsAt: 0 }, NOW)).toEqual({
      text: "95% used",
      tone: "amber",
    });
  });
});
