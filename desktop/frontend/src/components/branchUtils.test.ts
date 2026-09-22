import { describe, expect, it } from "vitest";
import { isUnpublished } from "./branchUtils";

const base = {
  isGitRepo: true,
  branch: "feat/footer",
  detached: false,
  hasUpstream: false,
  hasRemote: true,
  ahead: 0,
  behind: 0,
  uncommitted: 0,
};

describe("isUnpublished", () => {
  it("is true for a local branch with a remote to push to but no upstream", () => {
    expect(isUnpublished(base)).toBe(true);
  });

  it("is false once the branch tracks an upstream", () => {
    expect(isUnpublished({ ...base, hasUpstream: true })).toBe(false);
  });

  it("is false when the repo has no remote at all", () => {
    expect(isUnpublished({ ...base, hasRemote: false })).toBe(false);
  });

  it("is false for detached HEAD, a missing branch name, and no status", () => {
    expect(isUnpublished({ ...base, detached: true, branch: "a1b2c3d" })).toBe(false);
    expect(isUnpublished({ ...base, branch: "" })).toBe(false);
    expect(isUnpublished({ ...base, isGitRepo: false })).toBe(false);
    expect(isUnpublished(null)).toBe(false);
  });
});
