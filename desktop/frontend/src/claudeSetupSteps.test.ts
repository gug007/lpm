import { describe, expect, it } from "vitest";
import { deriveClaudeSetupSteps } from "./claudeSetupSteps";
import type { ClaudeAccount } from "./types";
import type { ClaudeAccountStatus } from "./store/accounts";

const acc = (id: string, label = id): ClaudeAccount => ({ id, label });
const signedIn: ClaudeAccountStatus = { signedIn: true, email: "a@b.co" };
const signedOut: ClaudeAccountStatus = { signedIn: false, email: "" };

describe("deriveClaudeSetupSteps", () => {
  it("no accounts: step 1 is current, nothing complete", () => {
    const p = deriveClaudeSetupSteps([], {}, {});
    expect(p.completion).toEqual([false, false, false]);
    expect(p.currentStep).toBe(0);
    expect(p.allComplete).toBe(false);
  });

  it("account added but signed out: step 2 is current", () => {
    const p = deriveClaudeSetupSteps([acc("1")], { "1": signedOut }, {});
    expect(p.completion).toEqual([true, false, false]);
    expect(p.currentStep).toBe(1);
  });

  it("signed in but unassigned: step 3 is current", () => {
    const p = deriveClaudeSetupSteps([acc("1")], { "1": signedIn }, {});
    expect(p.completion).toEqual([true, true, false]);
    expect(p.currentStep).toBe(2);
  });

  it("assigned and signed in: all complete", () => {
    const p = deriveClaudeSetupSteps([acc("1")], { "1": signedIn }, { "1": ["proj"] });
    expect(p.completion).toEqual([true, true, true]);
    expect(p.currentStep).toBe(-1);
    expect(p.allComplete).toBe(true);
  });

  it("sign-in and assignment can be satisfied by different accounts", () => {
    const p = deriveClaudeSetupSteps(
      [acc("1"), acc("2")],
      { "1": signedIn, "2": signedOut },
      { "2": ["proj"] },
    );
    expect(p.completion).toEqual([true, true, true]);
    expect(p.allComplete).toBe(true);
  });

  it("stale usage for a removed account does not count", () => {
    const p = deriveClaudeSetupSteps([acc("1")], { "1": signedIn }, { "ghost": ["proj"] });
    expect(p.completion[2]).toBe(false);
    expect(p.currentStep).toBe(2);
  });

  it("empty usage array does not count as assigned", () => {
    const p = deriveClaudeSetupSteps([acc("1")], { "1": signedIn }, { "1": [] });
    expect(p.completion[2]).toBe(false);
  });
});
