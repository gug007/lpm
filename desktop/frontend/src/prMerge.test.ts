import { describe, expect, it } from "vitest";
import {
  allowedMethods,
  armedText,
  mergeMode,
  mergeStatus,
  mergedText,
  pickMethod,
  reviewLine,
  waitText,
} from "./prMerge";
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

const none = { wait: false, now: false, bypass: false };

describe("mergeStatus", () => {
  it("is ready when GitHub says it merges cleanly", () => {
    expect(mergeStatus(info())).toEqual({ kind: "ready", ...none, now: true });
    expect(mergeStatus(info({ state: "UNSTABLE" })).now).toBe(true);
    expect(mergeStatus(info({}, { checks: [] })).kind).toBe("ready");
  });

  it("holds a draft back with a way out", () => {
    expect(mergeStatus(info({ canBypass: true }, { isDraft: true }))).toEqual({
      kind: "blocked",
      note: "Draft pull requests can't be merged. Mark it ready for review on GitHub.",
      ...none,
    });
  });

  it("can wait for running checks, and merge now when GitHub would", () => {
    expect(mergeStatus(info({ state: "BLOCKED" }, { checks: [check("pass"), check("pending")] }))).toEqual({
      kind: "waiting",
      ...none,
      wait: true,
    });
    expect(mergeStatus(info({ state: "UNSTABLE" }, { checks: [check("pending")] }))).toEqual({
      kind: "waiting",
      ...none,
      wait: true,
      now: true,
    });
  });

  it("offers the bypass to someone allowed, while checks run, fail, or the rules say no", () => {
    const running = mergeStatus(info({ state: "BLOCKED", canBypass: true }, { checks: [check("pending")] }));
    expect(running).toEqual({ kind: "waiting", ...none, wait: true, bypass: true });
    const failing = mergeStatus(info({ state: "BLOCKED", canBypass: true }, { checks: [check("fail")] }));
    expect(failing).toEqual({ kind: "blocked", ...none, bypass: true });
    expect(mergeStatus(info({ state: "BLOCKED", canBypass: true }))).toEqual({
      kind: "blocked",
      note: "The rules on main don't allow merging yet. You can bypass them from the arrow beside the merge button.",
      ...none,
      bypass: true,
    });
    expect(mergeStatus(info({ state: "CLEAN", canBypass: true })).bypass).toBe(false);
  });

  it("puts conflicts before anything else", () => {
    expect(mergeStatus(info({ mergeable: "CONFLICTING", canBypass: true }, { checks: [check("pending")] }))).toEqual({
      kind: "blocked",
      ...none,
    });
    expect(mergeStatus(info({ state: "BLOCKED", review: "CHANGES_REQUESTED" }))).toEqual({ kind: "blocked", ...none });
  });

  it("names the base branch when it is behind or its rules say no", () => {
    expect(mergeStatus(info({ state: "BEHIND" })).note).toBe("This branch is behind main. Update it before merging.");
    expect(mergeStatus(info({ state: "BLOCKED", base: "" })).note).toBe(
      "The rules on its base branch don't allow merging yet.",
    );
  });

  it("is still checking while GitHub works it out", () => {
    expect(mergeStatus(info({ mergeable: "UNKNOWN", state: "UNKNOWN" }))).toEqual({ kind: "checking", ...none });
  });
});

describe("mergeMode", () => {
  const waiting = { kind: "waiting" as const, wait: true, now: true, bypass: true };

  it("waits by default, keeps a pick while it's on offer, and never bypasses unasked", () => {
    expect(mergeMode(waiting, null)).toBe("wait");
    expect(mergeMode(waiting, "now")).toBe("now");
    expect(mergeMode({ ...waiting, now: false }, "now")).toBe("wait");
    expect(mergeMode({ kind: "blocked", ...none, bypass: true }, null)).toBeNull();
    expect(mergeMode({ kind: "blocked", ...none, bypass: true }, "bypass")).toBe("bypass");
    expect(mergeMode({ kind: "ready", ...none, now: true }, "wait")).toBe("now");
  });
});

describe("wait texts", () => {
  it("says what waiting does, and when it bypasses", () => {
    expect(waitText(1, false, "main")).toBe("lpm merges once the running check passes");
    expect(waitText(3, true, "main")).toBe(
      "lpm merges once the 3 running checks pass, bypassing the rules on main if they still block it",
    );
    expect(armedText({ method: "squash", bypass: false, deleteBranch: true }, "main")).toBe(
      "Squash and merge once the running checks pass, then delete the branch on GitHub. Stops if a check fails.",
    );
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
