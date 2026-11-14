import { describe, expect, it } from "vitest";
import { applyCloneProgress, countLabel, phaseMarks, type CloneProgressEvent } from "./cloneProgress";

const event = (over: Partial<CloneProgressEvent>): CloneProgressEvent => ({
  id: "c1",
  phase: "receiving",
  percent: null,
  done: null,
  total: null,
  size: null,
  speed: null,
  finished: false,
  ...over,
});

describe("applyCloneProgress", () => {
  it("keeps the downloaded size after receiving and drops the speed", () => {
    const receiving = applyCloneProgress(
      null,
      event({ percent: 62, done: 765, total: 1234, size: "812.00 MiB", speed: "18.00 MiB/s" }),
    );
    expect(receiving).toMatchObject({ percent: 62, size: "812.00 MiB", speed: "18.00 MiB/s" });
    const resolving = applyCloneProgress(receiving, event({ phase: "resolving", percent: 10, done: 4, total: 40 }));
    expect(resolving).toMatchObject({ phase: "resolving", percent: 10, size: "812.00 MiB", speed: null });
  });

  it("drops the speed once a phase is done", () => {
    const done = applyCloneProgress(
      null,
      event({ percent: 100, size: "1.20 GiB", speed: "18.00 MiB/s", finished: true }),
    );
    expect(done).toMatchObject({ size: "1.20 GiB", speed: null, finished: true });
  });

  it("never goes back to an earlier phase", () => {
    const resolving = applyCloneProgress(null, event({ phase: "resolving", percent: 50 }));
    expect(applyCloneProgress(resolving, event({ phase: "counting", percent: 100 }))).toBe(resolving);
  });
});

describe("phaseMarks", () => {
  it("ignores a phase this build doesn't know", () => {
    const unknown = event({ phase: "verifying" as CloneProgressEvent["phase"] });
    expect(applyCloneProgress(null, unknown)).toBeNull();
  });

  it("marks earlier phases done and the current one current", () => {
    const p = applyCloneProgress(null, event({ phase: "receiving", percent: 5 }));
    expect(phaseMarks(p)).toEqual({
      counting: "done",
      compressing: "done",
      receiving: "current",
      resolving: "todo",
      checkout: "todo",
    });
  });

  it("marks a finished phase done", () => {
    const p = applyCloneProgress(null, event({ phase: "checkout", percent: 100, finished: true }));
    expect(phaseMarks(p).checkout).toBe("done");
  });

  it("marks nothing before the first update", () => {
    expect(Object.values(phaseMarks(null))).toEqual(["todo", "todo", "todo", "todo", "todo"]);
  });
});

describe("countLabel", () => {
  it("names the phase's unit", () => {
    const label = (over: Partial<CloneProgressEvent>) => countLabel(applyCloneProgress(null, event(over))!);
    expect(label({ done: 765, total: 1234 })).toBe("765 / 1,234 objects");
    expect(label({ phase: "counting", done: 424499 })).toBe("424,499 objects");
    expect(label({ phase: "checkout", done: 3, total: 9 })).toBe("3 / 9 files");
    expect(label({})).toBeNull();
  });
});
