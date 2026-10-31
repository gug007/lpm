import { describe, expect, it } from "vitest";
import { coAuthorName, commitAgent, commitBody, lineTotals, remoteBoundary, type HistoryCommit } from "./gitHistory";

const commit = (over: Partial<HistoryCommit>): HistoryCommit => ({
  hash: "a".repeat(40),
  short: "aaaaaaa",
  subject: "Add billing",
  body: "",
  author: "Ann",
  email: "ann@example.com",
  time: 0,
  parents: 1,
  coAuthors: [],
  unpushed: false,
  ...over,
});

describe("commitAgent", () => {
  it("reads the agent from a co-author trailer", () => {
    expect(commitAgent(commit({ coAuthors: ["Claude Opus 5.5 <noreply@anthropic.com>"] }))).toBe("claude");
    expect(commitAgent(commit({ coAuthors: ["Ben <ben@x.dev>", "Codex <codex@openai.com>"] }))).toBe("codex");
  });

  it("is null for a commit only people wrote", () => {
    expect(commitAgent(commit({ coAuthors: ["Ben <ben@x.dev>"] }))).toBeNull();
  });
});

describe("commit text", () => {
  it("drops co-author lines from the body", () => {
    expect(commitBody("Why it changed.\n\nCo-Authored-By: Claude <noreply@anthropic.com>")).toBe("Why it changed.");
  });

  it("names a co-author without the address", () => {
    expect(coAuthorName("Claude Opus 5.5 <noreply@anthropic.com>")).toBe("Claude Opus 5.5");
  });
});

describe("remoteBoundary", () => {
  it("is the first pushed commit after unpushed ones", () => {
    const commits = [commit({ unpushed: true }), commit({ unpushed: true }), commit({}), commit({})];
    expect(remoteBoundary(commits)).toBe(2);
  });

  it("is null when nothing or everything is pushed", () => {
    expect(remoteBoundary([commit({})])).toBeNull();
    expect(remoteBoundary([commit({ unpushed: true })])).toBeNull();
  });
});

describe("lineTotals", () => {
  it("adds up the lines, skipping binary files", () => {
    expect(
      lineTotals([
        { path: "a", oldPath: null, status: "modified", added: 3, removed: 1 },
        { path: "b.png", oldPath: null, status: "added", added: null, removed: null },
      ]),
    ).toEqual({ added: 3, removed: 1 });
  });
});
