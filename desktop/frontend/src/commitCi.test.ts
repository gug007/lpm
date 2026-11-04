import { describe, expect, it } from "vitest";
import { commitCiLabel, commitCiMark, commitCiStates, hasRunningCi } from "./commitCi";

const states = commitCiStates([
  { sha: "failed", state: "fail" },
  { sha: "running", state: "pending" },
  { sha: "green", state: "pass" },
]);

describe("commitCiMark", () => {
  it("gives a pushed commit its own result", () => {
    expect(commitCiMark({ hash: "failed", unpushed: false }, states)).toBe("fail");
    expect(commitCiMark({ hash: "green", unpushed: false }, states)).toBe("pass");
  });

  it("marks a commit CI can't have seen yet, whatever is known about its hash", () => {
    expect(commitCiMark({ hash: "new", unpushed: true }, states)).toBe("unpushed");
    expect(commitCiMark({ hash: "green", unpushed: true }, states)).toBe("unpushed");
  });

  it("says nothing about a pushed commit with no result", () => {
    expect(commitCiMark({ hash: "docs-only", unpushed: false }, states)).toBeNull();
  });
});

describe("commitCiLabel", () => {
  it("names each mark for the icon's tooltip and for screen readers", () => {
    expect(commitCiLabel("fail")).toBe("CI failed");
    expect(commitCiLabel("pending")).toBe("CI running");
    expect(commitCiLabel("pass")).toBe("CI passed");
    expect(commitCiLabel("unpushed")).toBe("Not pushed yet");
  });
});

describe("hasRunningCi", () => {
  it("is true only while a commit's checks are running", () => {
    expect(hasRunningCi(states)).toBe(true);
    expect(hasRunningCi(commitCiStates([{ sha: "green", state: "pass" }]))).toBe(false);
  });
});
