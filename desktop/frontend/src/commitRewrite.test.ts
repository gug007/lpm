import { describe, expect, it } from "vitest";
import { canAmendCommit, canUndoCommit, filesPhrase, fullMessage } from "./commitRewrite";

const commit = (parents: number, unpushed: boolean) => ({ parents, unpushed });
const repo = { hasRemote: true, detached: false };

describe("canUndoCommit", () => {
  it("takes back an unpushed commit with one parent", () => {
    expect(canUndoCommit(commit(1, true), repo)).toBe(true);
  });

  it("never offers a pushed commit, a merge, the first commit or a detached head", () => {
    expect(canUndoCommit(commit(1, false), repo)).toBe(false);
    expect(canUndoCommit(commit(2, true), repo)).toBe(false);
    expect(canUndoCommit(commit(0, true), repo)).toBe(false);
    expect(canUndoCommit(commit(1, true), { ...repo, detached: true })).toBe(false);
    expect(canUndoCommit(undefined, repo)).toBe(false);
    expect(canUndoCommit(commit(1, true), null)).toBe(false);
  });

  it("treats every commit as unpushed when there is no remote", () => {
    expect(canUndoCommit(commit(1, false), { hasRemote: false })).toBe(true);
  });
});

describe("canAmendCommit", () => {
  it("allows the first commit but not a merge", () => {
    expect(canAmendCommit(commit(0, true), repo)).toBe(true);
    expect(canAmendCommit(commit(2, true), repo)).toBe(false);
    expect(canAmendCommit(commit(1, false), repo)).toBe(false);
  });
});

describe("fullMessage", () => {
  it("joins the subject and the body with a blank line", () => {
    expect(fullMessage({ subject: "Add b", body: "Why.\n" })).toBe("Add b\n\nWhy.");
    expect(fullMessage({ subject: "Add b", body: "" })).toBe("Add b");
  });
});

describe("filesPhrase", () => {
  it("counts files", () => {
    expect(filesPhrase(1)).toBe("1 file is");
    expect(filesPhrase(3)).toBe("3 files are");
  });
});
