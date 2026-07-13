import { describe, it, expect } from "vitest";
import { buildCodexResumeCmd } from "./codexResume";

describe("buildCodexResumeCmd", () => {
  it("falls back to `codex` when startCmd is empty or undefined", () => {
    expect(buildCodexResumeCmd(undefined, "s1")).toBe("codex resume s1");
    expect(buildCodexResumeCmd("", "s1")).toBe("codex resume s1");
    expect(buildCodexResumeCmd("   ", "s1")).toBe("codex resume s1");
  });

  it("reuses the program token from startCmd", () => {
    expect(buildCodexResumeCmd("codex", "s1")).toBe("codex resume s1");
    expect(buildCodexResumeCmd("/usr/local/bin/codex", "s1")).toBe(
      "/usr/local/bin/codex resume s1",
    );
  });

  it("drops flags and prompt args from startCmd", () => {
    expect(buildCodexResumeCmd("codex --model gpt-5 'do the thing'", "s1")).toBe(
      "codex resume s1",
    );
  });

  it("preserves leading KEY=value env-assignment tokens", () => {
    expect(buildCodexResumeCmd("FOO=bar codex", "s1")).toBe(
      "FOO=bar codex resume s1",
    );
    expect(
      buildCodexResumeCmd("FOO=bar BAZ=qux codex --model gpt-5", "s1"),
    ).toBe("FOO=bar BAZ=qux codex resume s1");
  });

  it("does not treat a flag as an env assignment", () => {
    expect(buildCodexResumeCmd("codex --config=x", "s1")).toBe(
      "codex resume s1",
    );
  });
});
