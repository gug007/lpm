import { describe, expect, it } from "vitest";
import {
  actionsRunId,
  checksLabel,
  checksSummary,
  failingRunIds,
  markRerunning,
  sortedChecks,
  summarizeChecks,
} from "./prChecks";
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

describe("actionsRunId", () => {
  it("reads the run id from a job URL only", () => {
    expect(actionsRunId("https://github.com/o/r/actions/runs/40115672821/job/120936319373")).toBe("40115672821");
    expect(actionsRunId("https://vercel.com/x")).toBeNull();
  });
});

describe("branch checks", () => {
  const job = (name: string, state: PrCheck["state"], run: number, extra: Partial<PrCheck> = {}): PrCheck => ({
    name,
    workflow: "Linux host",
    state,
    url: `https://github.com/o/r/actions/runs/${run}/job/1`,
    ...extra,
  });

  it("summarizes any list of checks, skipped ones aside", () => {
    expect(summarizeChecks([job("a", "pass", 1), job("b", "skipped", 1)])?.verdict).toBe("pass");
    expect(summarizeChecks([job("b", "skipped", 1)])).toBeNull();
  });

  it("names each failing run once, and marks only its failed checks running again", () => {
    const checks = [job("a", "fail", 7), job("b", "fail", 7), job("c", "fail", 8), job("d", "pass", 7)];
    expect(failingRunIds(checks)).toEqual(["7", "8"]);
    expect(markRerunning(checks, ["7"]).map((c) => c.state)).toEqual(["pending", "pending", "fail", "pass"]);
  });
});
