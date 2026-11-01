import { describe, expect, it } from "vitest";
import { buildGraph, mergedBranchName } from "./gitGraph";

const c = (hash: string, parents: string[], subject = hash) => ({ hash, parentHashes: parents, subject });

describe("buildGraph", () => {
  it("keeps a straight history in one lane", () => {
    const { rows, width } = buildGraph([c("c", ["b"]), c("b", ["a"]), c("a", [])]);
    expect(width).toBe(1);
    expect(rows.map((r) => [r.col, r.branch])).toEqual([[0, 0], [0, 0], [0, 0]]);
    expect(rows[0].top).toEqual([]);
    expect(rows[0].bottom).toEqual([{ from: 0, to: 0, branch: 0 }]);
    expect(rows[2].bottom).toEqual([]);
  });

  it("opens a lane for a merged branch and closes it where the branch split off", () => {
    const { rows, width } = buildGraph([
      c("m", ["a", "b"], "Merge branch 'coupon-field'"),
      c("a", ["base"]),
      c("b", ["base"]),
      c("base", []),
    ]);
    expect(width).toBe(2);
    expect(rows[0]).toMatchObject({ col: 0, branch: 0, merge: true, label: null });
    expect(rows[0].bottom).toEqual([
      { from: 0, to: 1, branch: 1 },
      { from: 0, to: 0, branch: 0 },
    ]);
    expect(rows[1]).toMatchObject({ col: 0, branch: 0, merge: false });
    expect(rows[2]).toMatchObject({ col: 1, branch: 1, label: "coupon-field" });
    expect(rows[3].col).toBe(0);
    expect(rows[3].top).toEqual([
      { from: 0, to: 0, branch: 0 },
      { from: 1, to: 0, branch: 1 },
    ]);
    expect(rows[3].bottom).toEqual([]);
  });

  it("joins a merge parent another lane already waits for", () => {
    const { rows } = buildGraph([
      c("m2", ["m1", "b"]),
      c("m1", ["a", "b"]),
      c("a", ["base"]),
      c("b", ["base"]),
      c("base", []),
    ]);
    expect(rows[1].bottom).toEqual([
      { from: 0, to: 1, branch: 1 },
      { from: 0, to: 0, branch: 0 },
      { from: 1, to: 1, branch: 1 },
    ]);
    expect(rows[3]).toMatchObject({ col: 1, branch: 1 });
  });

  it("starts a new line for a commit no row above leads to", () => {
    const { rows } = buildGraph([c("x", ["base"]), c("y", ["base"]), c("base", [])]);
    expect(rows[1]).toMatchObject({ col: 1, branch: 1 });
    expect(rows[2].top).toEqual([
      { from: 0, to: 0, branch: 0 },
      { from: 1, to: 0, branch: 1 },
    ]);
  });

  it("reuses a lane once its branch has ended", () => {
    const { rows, width } = buildGraph([
      c("m2", ["m1", "f2"], "Merge branch 'two'"),
      c("f2", ["m1"]),
      c("m1", ["a", "f1"], "Merge branch 'one'"),
      c("f1", ["a"]),
      c("a", []),
    ]);
    expect(width).toBe(2);
    expect(rows[3]).toMatchObject({ col: 1, branch: 2, label: "one" });
    expect(rows[1]).toMatchObject({ col: 1, branch: 1, label: "two" });
  });

  it("draws every row the same however the history was paged", () => {
    const commits = [
      c("m2", ["m1", "f2"]),
      c("f2", ["f1"]),
      c("m1", ["a", "x"]),
      c("f1", ["a"]),
      c("x", ["a"]),
      c("a", ["root"]),
      c("root", []),
    ];
    const whole = buildGraph(commits).rows;
    for (let n = 1; n <= commits.length; n++) {
      expect(buildGraph(commits.slice(0, n)).rows).toEqual(whole.slice(0, n));
    }
  });

  it("leaves lines open at the bottom of a page for the commits still to load", () => {
    const { rows } = buildGraph([c("m", ["a", "b"]), c("a", ["older"])]);
    expect(rows[1].bottom.map((l) => l.to)).toEqual([0, 1]);
  });
});

describe("mergedBranchName", () => {
  it("reads the branch from git's and GitHub's merge subjects", () => {
    expect(mergedBranchName("Merge branch 'coupon-field'")).toBe("coupon-field");
    expect(mergedBranchName("Merge branch 'fix' into main")).toBe("fix");
    expect(mergedBranchName("Merge remote-tracking branch 'origin/main'")).toBe("origin/main");
    expect(mergedBranchName("Merge pull request #142 from priya/fix-login-redirect")).toBe("fix-login-redirect");
    expect(mergedBranchName("Add billing")).toBeNull();
  });
});
