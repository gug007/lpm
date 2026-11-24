import { beforeEach, describe, expect, it, vi } from "vitest";

const git = vi.hoisted(() => ({
  status: {} as Record<string, unknown> | null,
  files: [] as { path: string; status: string }[],
  defaultBranch: "main",
  commitCount: 0,
}));

vi.mock("../bridge/commands", () => ({
  GitStatus: vi.fn(async () => git.status),
  GitChangedFiles: vi.fn(async () => git.files),
  GitDefaultBranch: vi.fn(async () => git.defaultBranch),
  GitCommitCount: vi.fn(async () => git.commitCount),
}));

import { GitCommitCount } from "../bridge/commands";
import { loadUnsavedWork, unsavedWorkLines, worktreeBranch, worktreeBranchName } from "./unsavedWork";

beforeEach(() => {
  git.status = { isGitRepo: true, branch: "main", hasUpstream: true, ahead: 0 };
  git.files = [];
  git.defaultBranch = "main";
  git.commitCount = 0;
  vi.mocked(GitCommitCount).mockClear();
});

describe("loadUnsavedWork", () => {
  it("is null outside a git repository", async () => {
    git.status = { isGitRepo: false };
    expect(await loadUnsavedWork("/copy")).toBeNull();
  });

  it("counts changed files once each, untracked files, and commits ahead of the upstream", async () => {
    git.status = { isGitRepo: true, branch: "main", hasUpstream: true, ahead: 2 };
    git.files = [
      { path: "README.md", status: "modified" },
      { path: "README.md", status: "modified" },
      { path: "src/gone.ts", status: "deleted" },
      { path: "notes.txt", status: "untracked" },
    ];
    expect(await loadUnsavedWork("/copy")).toEqual({
      changed: 2,
      untracked: 1,
      unpushed: 2,
      base: null,
    });
    expect(GitCommitCount).not.toHaveBeenCalled();
  });

  it("counts a branch without an upstream against the default branch", async () => {
    git.status = { isGitRepo: true, branch: "lpm/storefront-8MZUXf", hasUpstream: false };
    git.commitCount = 3;
    expect(await loadUnsavedWork("/wt")).toEqual({
      changed: 0,
      untracked: 0,
      unpushed: 3,
      base: "main",
    });
    expect(GitCommitCount).toHaveBeenCalledWith("/wt", "main", "HEAD");
  });

  it("doesn't compare the default branch with itself", async () => {
    git.status = { isGitRepo: true, branch: "main", hasUpstream: false };
    expect((await loadUnsavedWork("/copy"))?.unpushed).toBe(0);
    expect(GitCommitCount).not.toHaveBeenCalled();
  });
});

describe("unsavedWorkLines", () => {
  it("is empty when nothing would be lost", () => {
    expect(unsavedWorkLines({ changed: 0, untracked: 0, unpushed: 0, base: null })).toEqual([]);
  });

  it("names each kind of unsaved work", () => {
    expect(unsavedWorkLines({ changed: 1, untracked: 2, unpushed: 1, base: null })).toEqual([
      "1 changed file not committed",
      "2 untracked files",
      "1 commit not pushed",
    ]);
    expect(unsavedWorkLines({ changed: 0, untracked: 0, unpushed: 4, base: "main" })).toEqual([
      "4 commits not on main",
    ]);
  });
});

describe("worktreeBranch", () => {
  it("is the one the project names, for a worktree started from an issue", () => {
    expect(worktreeBranch({ name: "storefront-8MZUXf", worktreeBranch: "45-cart-badge" })).toBe("45-cart-badge");
  });

  it("is otherwise named after the project, without its computer", () => {
    expect(worktreeBranch({ name: "peer-aaaaaaaa-storefront-8MZUXf" })).toBe("lpm/storefront-8MZUXf");
  });
});

describe("worktreeBranchName", () => {
  it("matches the branch lpm creates for a worktree", () => {
    expect(worktreeBranchName("storefront-8MZUXf")).toBe("lpm/storefront-8MZUXf");
    expect(worktreeBranchName("Project name/@{draft}.lock")).toBe("lpm/Project-name-draft-lock");
    expect(worktreeBranchName("---")).toBe("lpm/worktree");
  });
});
