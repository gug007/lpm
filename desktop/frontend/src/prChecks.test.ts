import { describe, expect, it } from "vitest";
import { actionsRunId, checksLabel, checksSummary, fixChecksPrompt, sortedChecks } from "./prChecks";
import type { PrCheck, PullRequestInfo } from "./types";

const check = (name: string, state: PrCheck["state"], url = ""): PrCheck => ({ name, workflow: "CI", state, url });

const pr = (checks: PrCheck[], state: PullRequestInfo["state"] = "OPEN"): PullRequestInfo => ({
  number: 142,
  url: "https://github.com/o/r/pull/142",
  state,
  title: "Billing",
  isDraft: false,
  checks,
});

describe("checksSummary", () => {
  it("fails when any check fails", () => {
    const summary = checksSummary(pr([check("a", "fail"), check("b", "pending"), check("c", "pass")]));
    expect(summary).toEqual({ verdict: "fail", failed: 1, pending: 1, passed: 1 });
    expect(checksLabel(summary!)).toBe("1 failing");
  });

  it("is running while nothing failed and something is pending", () => {
    const summary = checksSummary(pr([check("a", "pending"), check("b", "pending"), check("c", "pass")]));
    expect(summary?.verdict).toBe("pending");
    expect(checksLabel(summary!)).toBe("2 running");
  });

  it("passes when every counted check passed, skipped ones aside", () => {
    const summary = checksSummary(pr([check("a", "pass"), check("b", "skipped")]));
    expect(summary?.verdict).toBe("pass");
    expect(checksLabel(summary!)).toBe("Checks passed");
  });

  it("shows nothing for a PR without checks, with only skipped ones, or one no longer open", () => {
    expect(checksSummary(pr([]))).toBeNull();
    expect(checksSummary({ ...pr([]), checks: undefined })).toBeNull();
    expect(checksSummary(pr([check("a", "skipped")]))).toBeNull();
    expect(checksSummary(pr([check("a", "fail")], "MERGED"))).toBeNull();
    expect(checksSummary(pr([check("a", "fail")], "CLOSED"))).toBeNull();
  });
});

describe("sortedChecks", () => {
  it("puts failing first, then running, passed and skipped", () => {
    const sorted = sortedChecks([
      check("z", "pass"),
      check("skip", "skipped"),
      check("b", "fail"),
      check("run", "pending"),
      check("a", "fail"),
    ]);
    expect(sorted.map((c) => c.name)).toEqual(["a", "b", "run", "z", "skip"]);
  });
});

describe("fixChecksPrompt", () => {
  it("names each failing check and the gh commands that print why, once per run", () => {
    const prompt = fixChecksPrompt(
      pr([
        check("test (ubuntu)", "fail", "https://github.com/o/r/actions/runs/11/job/21"),
        check("test (macos)", "fail", "https://github.com/o/r/actions/runs/11/job/22"),
        check("Vercel", "fail"),
        check("lint", "pass", "https://github.com/o/r/actions/runs/11/job/23"),
      ]),
    );
    expect(prompt).toBe(
      [
        "CI checks are failing on pull request #142 (https://github.com/o/r/pull/142):",
        "- test (macos) — https://github.com/o/r/actions/runs/11/job/22",
        "- test (ubuntu) — https://github.com/o/r/actions/runs/11/job/21",
        "- Vercel",
        "",
        "Find out why with `gh pr checks 142` and `gh run view 11 --log-failed`, fix the cause, and run the same checks locally where you can to confirm the fix.",
      ].join("\n"),
    );
  });

  it("reads the run id from a job URL only", () => {
    expect(actionsRunId("https://github.com/o/r/actions/runs/40115672821/job/120936319373")).toBe("40115672821");
    expect(actionsRunId("https://vercel.com/x")).toBeNull();
  });
});
