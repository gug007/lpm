import { describe, expect, it } from "vitest";
import { isClaudeTab } from "./claudeTab";
import { makeTerminal } from "./paneTree";

describe("isClaudeTab", () => {
  it("knows a Claude tab by its launch command until its agent reports", () => {
    expect(isClaudeTab(makeTerminal("t", "Claude", { startCmd: "claude --session-id abc" }))).toBe(true);
    expect(isClaudeTab(makeTerminal("t", "Codex", { startCmd: "codex" }))).toBe(false);
    expect(isClaudeTab(makeTerminal("t", "Shell"))).toBe(false);
  });

  it("goes by the conversation the agent reported", () => {
    const typed = { ...makeTerminal("t", "Shell"), agentSession: { provider: "claude" as const, sessionId: "abc" } };
    expect(isClaudeTab(typed)).toBe(true);
  });

  it("drops a tab whose agent was quit", () => {
    const ended = { ...makeTerminal("t", "Claude", { resumeCmd: "claude --resume abc" }), agentEnded: true };
    expect(isClaudeTab(ended)).toBe(false);
  });
});
