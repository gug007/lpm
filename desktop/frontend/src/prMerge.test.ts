import { describe, expect, it } from "vitest";
import { allowedMethods, mergeStatus, mergedText, pickMethod, reviewLine } from "./prMerge";
import type { PrCheck, PrMergeOffer, PullRequestMergeInfo } from "./types";

const check = (state: PrCheck["state"]): PrCheck => ({ name: `c-${state}`, workflow: "ci", state, url: "" });

function info(merge: Partial<PrMergeOffer> = {}, extra: Partial<PullRequestMergeInfo> = {}): PullRequestMergeInfo {
  return {
    number: 142,
    url: "https://github.com/o/r/pull/142",
    state: "OPEN",
    title: "Add annual billing",
    isDraft: false,
    checks: [check("pass")],
    merge: {
      mergeable: "MERGEABLE",
      state: "CLEAN",
      review: "",
      head: "9e7d031",
      base: "main",
      methods: ["merge", "squash", "rebase"],
      deletesBranch: false,
      ...merge,
    },
    ...extra,
  };
}

describe("mergeStatus", () => {
  it("is ready when GitHub says it merges cleanly", () => {
    expect(mergeStatus(info())).toEqual({ kind: "ready" });
    expect(mergeStatus(info({ state: "UNSTABLE" }))).toEqual({ kind: "ready" });
    expect(mergeStatus(info({}, { checks: [] }))).toEqual({ kind: "ready" });
  });

  it("holds a draft back with a way out", () => {
    expect(mergeStatus(info({}, { isDraft: true }))).toEqual({
      kind: "blocked",
      note: "Draft pull requests can't be merged. Mark it ready for review on GitHub.",
    });
  });

  it("waits for running checks and holds back failing ones before anything else", () => {
    expect(mergeStatus(info({ state: "BLOCKED" }, { checks: [check("pass"), check("pending")] }))).toEqual({
      kind: "waiting",
    });
    expect(mergeStatus(info({ mergeable: "CONFLICTING" }, { checks: [check("fail")] }))).toEqual({ kind: "blocked" });
  });

  it("leaves conflicts and reviews to their own lines", () => {
    expect(mergeStatus(info({ mergeable: "CONFLICTING", state: "DIRTY" }))).toEqual({ kind: "blocked" });
    expect(mergeStatus(info({ state: "BLOCKED", review: "CHANGES_REQUESTED" }))).toEqual({ kind: "blocked" });
  });

  it("names the base branch when it is behind or its rules say no", () => {
    expect(mergeStatus(info({ state: "BEHIND" }))).toEqual({
      kind: "blocked",
      note: "This branch is behind main. Update it before merging.",
    });
    expect(mergeStatus(info({ state: "BLOCKED", base: "" }))).toEqual({
      kind: "blocked",
      note: "The rules on its base branch don't allow merging yet.",
    });
  });

  it("is still checking while GitHub works it out", () => {
    expect(mergeStatus(info({ mergeable: "UNKNOWN", state: "UNKNOWN" }))).toEqual({ kind: "checking" });
  });
});

describe("methods", () => {
  it("keeps GitHub's order and falls back to all of them", () => {
    expect(allowedMethods(["rebase", "squash"])).toEqual(["squash", "rebase"]);
    expect(allowedMethods([])).toEqual(["merge", "squash", "rebase"]);
  });

  it("starts on squash, then remembers, as the phone does", () => {
    expect(pickMethod(["merge", "squash", "rebase"], null)).toBe("squash");
    expect(pickMethod(["merge", "squash", "rebase"], "rebase")).toBe("rebase");
    expect(pickMethod(["merge", "rebase"], "squash")).toBe("merge");
  });
});

describe("lines", () => {
  it("reads the review decision", () => {
    expect(reviewLine("APPROVED")?.text).toBe("Approved");
    expect(reviewLine("REVIEW_REQUIRED")?.tone).toBe("pending");
    expect(reviewLine("")).toBeNull();
  });

  it("says what happened to the branch", () => {
    expect(mergedText("feat/billing", true)).toBe(
      "Its branch was deleted on GitHub. This checkout stays on feat/billing.",
    );
    expect(mergedText("", false)).toBe("This checkout stays as it is.");
  });
});
