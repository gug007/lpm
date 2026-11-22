import { describe, expect, it } from "vitest";
import type { OriginStatus } from "./originStatus";
import { detailShows, detailText, type RowData, type RowStats } from "./sidebarRowDetails";
import { DEFAULT_ROW_LAYOUT } from "./sidebarRowLayout";
import type { PrCheck, PullRequestInfo } from "./types";

const stats = (over: Partial<RowStats> = {}): RowStats => ({
  branch: "feat/billing",
  defaultBranch: "main",
  insertions: 0,
  deletions: 0,
  files: 0,
  lastCommitAt: 0,
  version: "",
  ...over,
});

const origin = (over: Partial<OriginStatus> = {}) => ({
  running: false,
  status: {
    branch: "feat/billing",
    hasUpstream: true,
    ahead: 0,
    behind: 0,
    base: "",
    baseBehind: 0,
    conflicted: false,
    changes: 0,
    fetched: true,
    ...over,
  },
});

const pr = (over: Partial<PullRequestInfo> = {}): PullRequestInfo => ({
  number: 412,
  url: "https://example.com/pull/412",
  state: "OPEN",
  title: "Billing portal",
  isDraft: false,
  ...over,
});

const check = (state: PrCheck["state"]) => ({ name: "ci", state }) as PrCheck;

const none = { alert: false, status: false, origin: true };
const layout = DEFAULT_ROW_LAYOUT;

describe("detailShows", () => {
  it("hides the default branch unless asked not to", () => {
    const onMain: RowData = { stats: stats({ branch: "main" }) };
    expect(detailShows("branch", onMain, none, layout)).toBe(false);
    expect(detailShows("branch", onMain, none, { ...layout, hideDefaultBranch: false })).toBe(true);
    expect(detailShows("branch", { stats: stats() }, none, layout)).toBe(true);
  });

  it("shows changes and files only when there are some", () => {
    expect(detailShows("changes", { stats: stats() }, none, layout)).toBe(false);
    expect(detailShows("changes", { stats: stats({ deletions: 3 }) }, none, layout)).toBe(true);
    expect(detailShows("files", { stats: stats({ files: 1 }) }, none, layout)).toBe(true);
  });

  it("ignores a pull request looked up for another branch", () => {
    const ci = { branch: "old", pr: pr(), checkedAt: 1 };
    expect(detailShows("pr", { stats: stats(), ci }, none, layout)).toBe(false);
    expect(detailShows("pr", { stats: stats(), ci: { ...ci, branch: "feat/billing" } }, none, layout)).toBe(true);
  });

  it("can keep passing checks off the row", () => {
    const ci = { branch: "feat/billing", pr: pr({ checks: [check("pass")] }), checkedAt: 1 };
    const data = { stats: stats(), ci };
    expect(detailShows("checks", data, none, layout)).toBe(true);
    expect(detailShows("checks", data, none, { ...layout, checksOnlyFailing: true })).toBe(false);
    const failing = { ...data, ci: { ...ci, pr: pr({ checks: [check("fail")] }) } };
    expect(detailShows("checks", failing, none, { ...layout, checksOnlyFailing: true })).toBe(true);
  });

  it("counts unpushed commits only while nothing is waiting to come down", () => {
    expect(detailShows("ahead", { origin: origin({ ahead: 2 }) }, none, layout)).toBe(true);
    expect(detailShows("ahead", { origin: origin({ ahead: 2, behind: 1 }) }, none, layout)).toBe(false);
    expect(detailShows("ahead", { origin: origin({ ahead: 2 }) }, { ...none, origin: false }, layout)).toBe(false);
  });

  it("leaves the row's own details to the row", () => {
    expect(detailShows("alert", {}, { ...none, alert: true }, layout)).toBe(true);
    expect(detailShows("status", {}, none, layout)).toBe(false);
  });
});

describe("detailText", () => {
  it("previews what the row would show, or nothing", () => {
    const data: RowData = {
      stats: stats({ insertions: 248, deletions: 61, files: 7, version: "2.4.1" }),
      origin: origin({ behind: 3 }),
      ci: { branch: "feat/billing", pr: pr({ isDraft: true }), checkedAt: 1 },
    };
    expect(detailText("changes", data, none, layout)).toBe("+248 −61");
    expect(detailText("files", data, none, layout)).toBe("7 files");
    expect(detailText("version", data, none, layout)).toBe("v2.4.1");
    expect(detailText("origin", data, none, layout)).toBe("↓3");
    expect(detailText("pr", data, none, layout)).toBe("#412 Draft");
    expect(detailText("ports", data, none, layout)).toBe("");
    expect(detailText("alert", data, none, layout)).toBeUndefined();
  });
});
