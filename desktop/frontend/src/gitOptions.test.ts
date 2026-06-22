import { describe, it, expect } from "vitest";
import {
  pullFlags,
  pushFlags,
  fetchFlags,
  normalizeGitPull,
  normalizeGitPush,
  normalizeGitFetch,
  DEFAULT_PULL_CONFIG,
  DEFAULT_PUSH_CONFIG,
  DEFAULT_FETCH_CONFIG,
} from "./gitOptions";

describe("pullFlags", () => {
  it("returns nothing when no flags set", () => {
    expect(pullFlags(DEFAULT_PULL_CONFIG)).toEqual([]);
  });
  it("emits autostash and no-verify in order", () => {
    expect(pullFlags({ strategy: "rebase", autostash: true, noVerify: true })).toEqual([
      "--autostash",
      "--no-verify",
    ]);
  });
});

describe("pushFlags", () => {
  it("returns nothing for the default push", () => {
    expect(pushFlags(DEFAULT_PUSH_CONFIG)).toEqual([]);
  });
  it("emits force-with-lease, no-verify, tags", () => {
    expect(pushFlags({ mode: "force-with-lease", noVerify: true, tags: true })).toEqual([
      "--force-with-lease",
      "--no-verify",
      "--tags",
    ]);
  });
});

describe("normalizeGitPull", () => {
  it("falls back to ff when nothing is stored", () => {
    expect(normalizeGitPull(undefined, undefined)).toEqual({
      strategy: "ff",
      autostash: false,
      noVerify: false,
    });
  });
  it("migrates a legacy ff-only strategy string", () => {
    expect(normalizeGitPull(undefined, "ff-only").strategy).toBe("ff-only");
  });
  it("migrates a legacy rebase strategy string", () => {
    expect(normalizeGitPull(undefined, "rebase").strategy).toBe("rebase");
  });
  it("maps an unknown legacy value (merge) to the default", () => {
    expect(normalizeGitPull(undefined, "merge").strategy).toBe("ff");
  });
  it("prefers the new object over the legacy string and coerces booleans", () => {
    expect(normalizeGitPull({ strategy: "rebase", autostash: 1 }, "ff-only")).toEqual({
      strategy: "rebase",
      autostash: true,
      noVerify: false,
    });
  });
});

describe("normalizeGitPush", () => {
  it("defaults to a plain push", () => {
    expect(normalizeGitPush(undefined)).toEqual({
      mode: "default",
      noVerify: false,
      tags: false,
    });
  });
  it("keeps a valid force-with-lease mode", () => {
    expect(normalizeGitPush({ mode: "force-with-lease", tags: true })).toEqual({
      mode: "force-with-lease",
      noVerify: false,
      tags: true,
    });
  });
});

describe("fetchFlags", () => {
  it("emits all and prune for the default fetch", () => {
    expect(fetchFlags(DEFAULT_FETCH_CONFIG)).toEqual(["--all", "--prune"]);
  });
  it("emits every flag in order when all are on", () => {
    expect(fetchFlags({ all: true, prune: true, pruneTags: true, tags: true })).toEqual([
      "--all",
      "--prune",
      "--prune-tags",
      "--tags",
    ]);
  });
  it("emits nothing when everything is off", () => {
    expect(fetchFlags({ all: false, prune: false, pruneTags: false, tags: false })).toEqual([]);
  });
});

describe("normalizeGitFetch", () => {
  it("defaults all and prune to on, tags off", () => {
    expect(normalizeGitFetch(undefined)).toEqual({
      all: true,
      prune: true,
      pruneTags: false,
      tags: false,
    });
  });
  it("preserves explicit false for all and prune", () => {
    expect(normalizeGitFetch({ all: false, prune: false })).toEqual({
      all: false,
      prune: false,
      pruneTags: false,
      tags: false,
    });
  });
  it("coerces truthy values to booleans", () => {
    expect(normalizeGitFetch({ tags: 1, pruneTags: "yes" })).toEqual({
      all: true,
      prune: true,
      pruneTags: true,
      tags: true,
    });
  });
});
