import { describe, expect, it } from "vitest";
import { agentSessionRefOf, buildClaudeResumeCmd, claudeResumeSessionId } from "./agentSession";

describe("agentSessionRefOf", () => {
  it("extracts Claude's resume id around other flags", () => {
    expect(
      agentSessionRefOf(
        "CLAUDE_CONFIG_DIR=/tmp/account claude --resume session-123 --model opus",
      ),
    ).toEqual({ provider: "claude", sessionId: "session-123" });
  });

  it("accepts Claude's resume subcommand form", () => {
    expect(agentSessionRefOf("/opt/bin/claude resume session_456")).toEqual({
      provider: "claude",
      sessionId: "session_456",
    });
  });

  it("extracts a Codex resume id", () => {
    expect(
      agentSessionRefOf(
        'CODEX_HOME=/tmp/codex /usr/local/bin/codex resume 019fac59-0da4',
      ),
    ).toEqual({ provider: "codex", sessionId: "019fac59-0da4" });
  });

  it("rejects launch commands and unsafe ids", () => {
    expect(agentSessionRefOf("claude --session-id abc")).toBeNull();
    expect(agentSessionRefOf("codex -c model=gpt-5")).toBeNull();
    expect(agentSessionRefOf("codex resume ../../state")).toBeNull();
  });
});

describe("buildClaudeResumeCmd", () => {
  it("replaces the id in an existing resume command", () => {
    expect(
      buildClaudeResumeCmd(
        "CLAUDE_CONFIG_DIR=/tmp/account /opt/bin/claude --resume old-id --model opus",
        "actual-id",
      ),
    ).toBe(
      "CLAUDE_CONFIG_DIR=/tmp/account /opt/bin/claude --resume actual-id --model opus",
    );
  });

  it("builds a canonical resume command for an ad-hoc Claude launch", () => {
    expect(buildClaudeResumeCmd("FOO=bar claude --model opus", "actual-id")).toBe(
      "FOO=bar claude --resume actual-id",
    );
    expect(buildClaudeResumeCmd(undefined, "actual-id")).toBe(
      "claude --resume actual-id",
    );
  });
});

describe("claudeResumeSessionId", () => {
  const sid = "0f8c2a51-6a8e-4c43-9a1e-2b7f3f5d9c10";

  it("names the conversation a Claude launch continues", () => {
    expect(claudeResumeSessionId(`claude --resume ${sid}`)).toBe(sid);
    expect(claudeResumeSessionId(`FOO=1 claude --model opus --resume ${sid}`)).toBe(sid);
  });

  it("leaves forks, new sessions and other agents to the project's choice", () => {
    expect(claudeResumeSessionId(`claude --resume ${sid} --fork-session --session-id x`)).toBeUndefined();
    expect(claudeResumeSessionId(`claude --session-id ${sid}`)).toBeUndefined();
    expect(claudeResumeSessionId(`codex resume ${sid}`)).toBeUndefined();
    expect(claudeResumeSessionId(undefined)).toBeUndefined();
  });
});
