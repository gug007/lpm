import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  GitCommitChecked: vi.fn(),
  GitCommit: vi.fn(),
  GitAmendCommit: vi.fn(),
}));
vi.mock("../bridge/commands", () => bridge);

import { commitChecked, commitHookPrompt, outputPreview, retryLabel, type HookFailure } from "./commitHook";

const failure = (over: Partial<HookFailure> = {}): HookFailure => ({
  hook: "pre-commit",
  summary: "eslint · 3 errors in src/billing.ts",
  output: "✖ eslint --fix:\n\n/repo/src/billing.ts\n  14:7  error  'total' is never reassigned  prefer-const",
  changed: [],
  ...over,
});

describe("commitChecked", () => {
  beforeEach(() => vi.resetAllMocks());

  it("hands back what the hook found", async () => {
    bridge.GitCommitChecked.mockResolvedValue(failure());
    await expect(commitChecked({ cwd: "/r", message: "m", files: ["a"] })).resolves.toEqual(failure());
    expect(bridge.GitCommitChecked).toHaveBeenCalledWith("/r", "m", ["a"], null, false);
  });

  it("commits the old way on a computer whose lpm lacks the command", async () => {
    bridge.GitCommitChecked.mockRejectedValue("command git_commit_checked not found");
    await expect(commitChecked({ cwd: "/r", message: "m", files: ["a"], amend: "abc" })).resolves.toBeNull();
    expect(bridge.GitAmendCommit).toHaveBeenCalledWith("/r", "m", ["a"], "abc");
    expect(bridge.GitCommit).not.toHaveBeenCalled();
  });

  it("never retries a real failure", async () => {
    bridge.GitCommitChecked.mockRejectedValue("nothing to commit");
    await expect(commitChecked({ cwd: "/r", message: "m", files: ["a"] })).rejects.toBe("nothing to commit");
    expect(bridge.GitCommit).not.toHaveBeenCalled();
  });
});

describe("outputPreview", () => {
  it("shows the lines that report something, without progress rows", () => {
    const output = "[STARTED] eslint --fix\n[FAILED] eslint --fix [FAILED]\n/repo/a.ts\n  1:1  error  x\nhusky - pre-commit script failed (code 1)";
    expect(outputPreview(output)).toEqual(["[FAILED] eslint --fix [FAILED]", "  1:1  error  x"]);
  });

  it("falls back to the last lines", () => {
    expect(outputPreview("one\ntwo\nthree")).toEqual(["one", "two", "three"]);
  });
});

describe("retryLabel", () => {
  it("offers to take in what a formatter fixed", () => {
    expect(retryLabel(failure())).toBe("Try again");
    expect(retryLabel(failure({ changed: ["a.ts"] }))).toBe("Add the file it changed and commit");
    expect(retryLabel(failure({ changed: ["a.ts", "b.ts"] }))).toBe("Add the 2 files it changed and commit");
  });
});

describe("commitHookPrompt", () => {
  it("asks for a fix and a commit with the hook running", () => {
    const prompt = commitHookPrompt(failure(), { message: "Add invoice rounding\n\nbody", files: ["src/billing.ts"] });
    expect(prompt).toContain('I tried to commit with the message "Add invoice rounding", and the pre-commit hook stopped it.');
    expect(prompt).toContain("It found: eslint · 3 errors in src/billing.ts.");
    expect(prompt).toContain("14:7  error  'total' is never reassigned");
    expect(prompt).toContain("don't skip it with --no-verify");
    expect(prompt).toContain("Files in the commit:\n- src/billing.ts");
  });

  it("leaves an amend to the person", () => {
    const prompt = commitHookPrompt(failure({ summary: null }), { message: "m", files: [], amend: true });
    expect(prompt).toContain("I tried to amend the last commit");
    expect(prompt).toContain("leave the changes uncommitted");
    expect(prompt).not.toContain("Files in the commit");
  });
});
