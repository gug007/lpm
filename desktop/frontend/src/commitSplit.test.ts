import { describe, expect, it, vi } from "vitest";
import { commitGroups, moveFile, readyToCommit, withMessage, type CommitGroup } from "./commitSplit";

const groups: CommitGroup[] = [
  { message: "feat(billing): verify signatures", files: ["route.ts", "stripe.ts"] },
  { message: "chore(deps): bump stripe", files: ["package.json"] },
];

describe("moveFile", () => {
  it("moves a file into another group", () => {
    expect(moveFile(groups, "stripe.ts", 1)).toEqual([
      { message: "feat(billing): verify signatures", files: ["route.ts"] },
      { message: "chore(deps): bump stripe", files: ["package.json", "stripe.ts"] },
    ]);
  });

  it("starts a new group past the last one", () => {
    expect(moveFile(groups, "route.ts", 2)).toEqual([
      { message: "feat(billing): verify signatures", files: ["stripe.ts"] },
      { message: "chore(deps): bump stripe", files: ["package.json"] },
      { message: "", files: ["route.ts"] },
    ]);
  });

  it("drops a group its last file left", () => {
    expect(moveFile(groups, "package.json", 0)).toEqual([
      { message: "feat(billing): verify signatures", files: ["route.ts", "stripe.ts", "package.json"] },
    ]);
  });
});

describe("readyToCommit", () => {
  it("needs a message on every group", () => {
    expect(readyToCommit(groups)).toBe(true);
    expect(readyToCommit(withMessage(groups, 1, "  "))).toBe(false);
    expect(readyToCommit([])).toBe(false);
  });
});

describe("commitGroups", () => {
  it("commits every group in order with its trimmed message", async () => {
    const commit = vi.fn(() => Promise.resolve());
    await expect(commitGroups(withMessage(groups, 0, " feat: a \n"), commit)).resolves.toEqual({ done: 2 });
    expect(commit.mock.calls).toEqual([
      ["feat: a", ["route.ts", "stripe.ts"]],
      ["chore(deps): bump stripe", ["package.json"]],
    ]);
  });

  it("stops at the first failure and says how many landed", async () => {
    const commit = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce("pre-commit hook failed");
    await expect(commitGroups([...groups, groups[0]], commit)).resolves.toEqual({
      done: 1,
      error: "pre-commit hook failed",
    });
    expect(commit).toHaveBeenCalledTimes(2);
  });
});
