import { describe, expect, it, vi } from "vitest";
import {
  firstLine,
  needsBranch,
  nothingToSubmitReason,
  planAutoPR,
  runAutoPR,
  type AutoPROps,
  type AutoPRRepoState,
  type AutoPRStepId,
  type AutoPRStepStatus,
} from "./autoPR";

const onMain: AutoPRRepoState = {
  branch: "main",
  defaultBranch: "main",
  detached: false,
  uncommitted: 3,
  hasUpstream: true,
  ahead: 0,
};

const onFeature: AutoPRRepoState = {
  ...onMain,
  branch: "feat/thing",
  uncommitted: 0,
  hasUpstream: true,
  ahead: 0,
};

function fakeOps(overrides: Partial<AutoPROps> = {}): AutoPROps {
  return {
    generateBranchName: vi.fn(async () => "Feat: Add Thing"),
    createBranch: vi.fn(async () => {}),
    changedPaths: vi.fn(async () => ["a.ts", "b.ts"]),
    generateCommitMessage: vi.fn(async () => "feat: add thing\n\nDetails here"),
    commit: vi.fn(async () => {}),
    push: vi.fn(async () => {}),
    generatePRTitle: vi.fn(async () => "Add thing\nignored"),
    generatePRDescription: vi.fn(async () => "  Body  "),
    createPullRequest: vi.fn(async () => " https://github.com/o/r/pull/7 \n"),
    ...overrides,
  };
}

type Event = [AutoPRStepId, AutoPRStepStatus, string | undefined];

function recorder() {
  const events: Event[] = [];
  return {
    events,
    report: (id: AutoPRStepId, status: AutoPRStepStatus, detail?: string) => {
      events.push([id, status, detail]);
    },
  };
}

describe("planAutoPR", () => {
  it("runs every step from the default branch with uncommitted work", () => {
    expect(planAutoPR(onMain)).toEqual(["branch", "commit", "push", "pr"]);
  });

  it("only opens the PR on a pushed, clean feature branch", () => {
    expect(planAutoPR(onFeature)).toEqual(["pr"]);
  });

  it("pushes an unpublished or ahead branch even with nothing to commit", () => {
    expect(planAutoPR({ ...onFeature, hasUpstream: false })).toEqual(["push", "pr"]);
    expect(planAutoPR({ ...onFeature, ahead: 2 })).toEqual(["push", "pr"]);
  });

  it("commits and pushes on a feature branch with changes", () => {
    expect(planAutoPR({ ...onFeature, uncommitted: 1 })).toEqual(["commit", "push", "pr"]);
  });

  it("treats a detached HEAD as needing a branch", () => {
    expect(needsBranch({ ...onFeature, detached: true })).toBe(true);
    expect(planAutoPR({ ...onFeature, detached: true })).toEqual(["branch", "push", "pr"]);
  });
});

describe("nothingToSubmitReason", () => {
  it("refuses a clean default branch", () => {
    expect(nothingToSubmitReason({ ...onMain, uncommitted: 0 })).toBe(
      "Nothing to open a pull request for: no changes on main.",
    );
  });

  it("allows a dirty default branch and any feature branch", () => {
    expect(nothingToSubmitReason(onMain)).toBeNull();
    expect(nothingToSubmitReason(onFeature)).toBeNull();
  });
});

describe("runAutoPR", () => {
  it("names, commits, pushes and opens the PR in order with slugged branch", async () => {
    const ops = fakeOps();
    const { events, report } = recorder();
    const res = await runAutoPR(onMain, ops, report);

    expect(ops.createBranch).toHaveBeenCalledWith("feat-add-thing");
    expect(ops.commit).toHaveBeenCalledWith("feat: add thing\n\nDetails here", ["a.ts", "b.ts"]);
    expect(ops.push).toHaveBeenCalledTimes(1);
    expect(ops.createPullRequest).toHaveBeenCalledWith("Add thing", "Body", "main");
    expect(res).toEqual({
      url: "https://github.com/o/r/pull/7",
      title: "Add thing",
      branch: "feat-add-thing",
      base: "main",
    });

    const done = events.filter((e) => e[1] === "done");
    expect(done).toEqual([
      ["branch", "done", "feat-add-thing"],
      ["commit", "done", "feat: add thing"],
      ["push", "done", "origin/feat-add-thing"],
      ["pr", "done", "Add thing"],
    ]);
    const order = events.map((e) => `${e[0]}:${e[1]}`);
    expect(order.indexOf("branch:done")).toBeLessThan(order.indexOf("commit:running"));
    expect(order.indexOf("commit:done")).toBeLessThan(order.indexOf("push:running"));
    expect(order.indexOf("push:done")).toBeLessThan(order.indexOf("pr:running"));
  });

  it("reports the planned-out steps as skipped up front", async () => {
    const ops = fakeOps();
    const { events, report } = recorder();
    await runAutoPR(onFeature, ops, report);

    expect(events.slice(0, 3)).toEqual([
      ["branch", "skipped", undefined],
      ["commit", "skipped", undefined],
      ["push", "skipped", undefined],
    ]);
    expect(ops.generateBranchName).not.toHaveBeenCalled();
    expect(ops.commit).not.toHaveBeenCalled();
    expect(ops.push).not.toHaveBeenCalled();
    expect(ops.createPullRequest).toHaveBeenCalledWith("Add thing", "Body", "main");
  });

  it("skips the commit when the status was stale and nothing changed", async () => {
    const ops = fakeOps({ changedPaths: vi.fn(async () => []) });
    const { events, report } = recorder();
    await runAutoPR({ ...onFeature, uncommitted: 2 }, ops, report);

    expect(ops.generateCommitMessage).not.toHaveBeenCalled();
    expect(events).toContainEqual(["commit", "skipped", undefined]);
    expect(ops.push).toHaveBeenCalledTimes(1);
  });

  it("marks the failing step and stops there", async () => {
    const ops = fakeOps({
      push: vi.fn(async () => {
        throw new Error("remote rejected");
      }),
    });
    const { events, report } = recorder();
    await expect(runAutoPR(onMain, ops, report)).rejects.toThrow("remote rejected");

    expect(events).toContainEqual(["push", "failed", "remote rejected"]);
    expect(ops.generatePRTitle).not.toHaveBeenCalled();
    expect(ops.createPullRequest).not.toHaveBeenCalled();
  });

  it("rejects an empty AI branch name before touching git", async () => {
    const ops = fakeOps({ generateBranchName: vi.fn(async () => "!!!") });
    const { events, report } = recorder();
    await expect(runAutoPR(onMain, ops, report)).rejects.toThrow("empty branch name");
    expect(ops.createBranch).not.toHaveBeenCalled();
    expect(events).toContainEqual(["branch", "failed", "empty branch name"]);
  });

  it("keeps the current branch name when no branch step runs", async () => {
    const ops = fakeOps();
    const { report } = recorder();
    const res = await runAutoPR({ ...onFeature, ahead: 1 }, ops, report);
    expect(res.branch).toBe("feat/thing");
  });
});

describe("firstLine", () => {
  it("returns the trimmed first line", () => {
    expect(firstLine("  title  \nbody")).toBe("title");
    expect(firstLine("")).toBe("");
  });
});
