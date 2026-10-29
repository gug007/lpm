import { beforeEach, describe, expect, it, vi } from "vitest";

const changedFiles = vi.fn();
const gitDiff = vi.fn();
const showCommit = vi.fn();
const discussion = vi.fn();
vi.mock("../bridge/commands", () => ({
  GitChangedFiles: (...args: unknown[]) => changedFiles(...args),
  GitDiff: (...args: unknown[]) => gitDiff(...args),
  GitShowCommit: (...args: unknown[]) => showCommit(...args),
  PullRequestDiscussion: (...args: unknown[]) => discussion(...args),
}));

import {
  capLines,
  captureGitMention,
  fencedBlock,
  formatPullRequestThread,
  type PullRequestThread,
} from "./mentionGitCapture";
import type { MentionItem } from "./mentions";

const diffItem: MentionItem = { kind: "diff", label: "Uncommitted changes", insert: "diff" };
const commitItem: MentionItem = { kind: "commit", label: "a1f3c9e Add CSV export", insert: "a1f3c9e" };
const prItem: MentionItem = { kind: "pr", label: "#212 Add CSV export", insert: "pr" };

const thread: PullRequestThread = {
  number: 212,
  title: "Add CSV export",
  url: "https://github.com/o/r/pull/212",
  body: "Exports invoices.",
  notes: [
    { kind: "line", author: "maria", body: "Quote names\nwith commas.", state: "", path: "src/csv.ts", line: 14, createdAt: "1" },
    { kind: "review", author: "maria", body: "", state: "CHANGES_REQUESTED", path: "", line: null, createdAt: "2" },
    { kind: "comment", author: "dev", body: "Fixed", state: "", path: "", line: null, createdAt: "3" },
  ],
};

beforeEach(() => {
  changedFiles.mockReset();
  gitDiff.mockReset();
  showCommit.mockReset();
  discussion.mockReset();
});

describe("fencedBlock", () => {
  it("labels a fenced block", () => {
    expect(fencedBlock("Commit a1", "body", "diff")).toBe("Commit a1:\n```diff\nbody\n```\n");
  });

  it("outgrows any backtick run inside so nested code can't close it", () => {
    expect(fencedBlock("PR", "see ```js\nx\n```")).toBe("PR:\n````\nsee ```js\nx\n```\n````\n");
  });
});

describe("capLines", () => {
  it("leaves short text alone", () => {
    expect(capLines("a\nb", 2)).toBe("a\nb");
  });

  it("keeps the first lines and says how many were left out", () => {
    expect(capLines("a\nb\nc\nd", 2)).toBe("a\nb\n… 2 more lines left out");
    expect(capLines("a\nb\nc", 2)).toBe("a\nb\n… 1 more line left out");
  });
});

describe("formatPullRequestThread", () => {
  it("lists the description and each note with who, verdict and where", () => {
    expect(formatPullRequestThread(thread)).toBe(
      [
        "#212 Add CSV export",
        "https://github.com/o/r/pull/212",
        "",
        "Exports invoices.",
        "",
        "Discussion:",
        "- maria on src/csv.ts:14: Quote names\n  with commas.",
        "- maria requested changes",
        "- dev: Fixed",
      ].join("\n"),
    );
  });

  it("says when nobody has commented", () => {
    const text = formatPullRequestThread({ ...thread, body: "", notes: [] });
    expect(text).toBe("#212 Add CSV export\nhttps://github.com/o/r/pull/212\n\nNo review comments yet.");
  });
});

describe("captureGitMention", () => {
  it("diffs every changed file into a diff block", async () => {
    changedFiles.mockResolvedValue([{ path: "a.ts" }, { path: "b.ts" }]);
    gitDiff.mockResolvedValue("diff --git a/a.ts b/a.ts\n+x\n");
    const text = await captureGitMention(diffItem, "/repo");
    expect(gitDiff).toHaveBeenCalledWith("/repo", ["a.ts", "b.ts"]);
    expect(text).toBe("Uncommitted changes (2 files):\n```diff\ndiff --git a/a.ts b/a.ts\n+x\n```\n");
  });

  it("rejects a clean tree without diffing", async () => {
    changedFiles.mockResolvedValue([]);
    await expect(captureGitMention(diffItem, "/repo")).rejects.toThrow("No uncommitted changes");
    expect(gitDiff).not.toHaveBeenCalled();
  });

  it("shows the picked commit", async () => {
    showCommit.mockResolvedValue("commit a1f3c9e\n\nAdd CSV export\n");
    const text = await captureGitMention(commitItem, "/repo");
    expect(showCommit).toHaveBeenCalledWith("/repo", "a1f3c9e");
    expect(text.startsWith("Commit a1f3c9e:\n```diff\ncommit a1f3c9e")).toBe(true);
  });

  it("formats the branch's pull request discussion", async () => {
    discussion.mockResolvedValue(thread);
    const text = await captureGitMention(prItem, "/repo");
    expect(text.startsWith("Pull request #212:\n```\n#212 Add CSV export")).toBe(true);
    expect(text).toContain("- dev: Fixed");
  });

  it("rejects when the branch has no pull request", async () => {
    discussion.mockResolvedValue(null);
    await expect(captureGitMention(prItem, "/repo")).rejects.toThrow("This branch has no pull request");
  });
});
