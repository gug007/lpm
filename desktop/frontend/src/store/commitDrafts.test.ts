// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { clearCommitDraft, commitDraft, saveCommitDraft } from "./commitDrafts";

describe("commit drafts", () => {
  beforeEach(() => window.localStorage.clear());

  it("keeps a message per project", () => {
    saveCommitDraft("/a", "Fix the login", 1000);
    saveCommitDraft("/b", "Add docs", 2000);
    expect(commitDraft("/a", 3000)).toEqual({ message: "Fix the login", savedAt: 1000 });
    expect(commitDraft("/b", 3000)?.message).toBe("Add docs");
  });

  it("forgets an empty message and a cleared one", () => {
    saveCommitDraft("/a", "Fix", 1000);
    saveCommitDraft("/a", "   ", 2000);
    expect(commitDraft("/a", 3000)).toBeNull();
    saveCommitDraft("/a", "Fix", 1000);
    clearCommitDraft("/a");
    expect(commitDraft("/a", 3000)).toBeNull();
  });

  it("drops drafts older than two weeks", () => {
    saveCommitDraft("/a", "Old", 0);
    expect(commitDraft("/a", 15 * 24 * 60 * 60 * 1000)).toBeNull();
  });

  it("survives unreadable storage", () => {
    window.localStorage.setItem("lpm:commit-drafts:v1", "{not json");
    expect(commitDraft("/a")).toBeNull();
    saveCommitDraft("/a", "Fix");
    expect(commitDraft("/a")?.message).toBe("Fix");
  });
});
