import { beforeEach, describe, expect, it } from "vitest";
import { prFromCreatedUrl, rememberCreatedPr, useBranchPr } from "./branchPr";

describe("prFromCreatedUrl", () => {
  it("reads the number off a gh pr create URL", () => {
    expect(prFromCreatedUrl("https://github.com/o/r/pull/128\n", "Footer link")).toEqual({
      number: 128,
      url: "https://github.com/o/r/pull/128",
      state: "OPEN",
      title: "Footer link",
      isDraft: false,
    });
  });

  it("reads a GitLab merge request's URL and marks it as GitLab's", () => {
    expect(prFromCreatedUrl("https://gitlab.acme.dev/t/app/-/merge_requests/12", "Rounding")).toEqual({
      number: 12,
      url: "https://gitlab.acme.dev/t/app/-/merge_requests/12",
      state: "OPEN",
      title: "Rounding",
      isDraft: false,
      host: "gitlab",
    });
  });

  it("marks a PR opened as a draft", () => {
    expect(prFromCreatedUrl("https://github.com/o/r/pull/7", "WIP", true)?.isDraft).toBe(true);
  });

  it("rejects output that is not a PR URL", () => {
    expect(prFromCreatedUrl("", "t")).toBeNull();
    expect(prFromCreatedUrl("https://github.com/o/r/pulls", "t")).toBeNull();
    expect(prFromCreatedUrl("Warning: 1 uncommitted change", "t")).toBeNull();
  });
});

describe("rememberCreatedPr", () => {
  beforeEach(() => useBranchPr.setState({ entries: {} }));

  it("stores the new PR under the project and branch it was made from", () => {
    rememberCreatedPr("/p", "feat", "https://github.com/o/r/pull/5", "Five");
    const entry = useBranchPr.getState().entries["/p"];
    expect(entry.branch).toBe("feat");
    expect(entry.pr?.number).toBe(5);
    expect(entry.checkedAt).toBeGreaterThan(0);
  });

  it("leaves the store alone for unparseable output", () => {
    rememberCreatedPr("/p", "feat", "nope", "Five");
    expect(useBranchPr.getState().entries["/p"]).toBeUndefined();
  });
});
