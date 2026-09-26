import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OriginStatus } from "./originStatus";

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  pull: vi.fn(),
  push: vi.fn(),
  merge: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("../bridge/commands", () => ({
  GitOriginStatus: mocks.status,
  PullBranch: mocks.pull,
  GitPush: mocks.push,
  GitMerge: mocks.merge,
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("./store/settings", () => ({
  getSettings: () => ({
    gitPull: { strategy: "ff-only", autostash: true, noVerify: false },
    gitPush: { mode: "default", noVerify: false, tags: false },
  }),
}));

import { recheckOrigin, runOriginAction } from "./originActions";
import { useOriginStatus } from "./store/originStatus";

const ROOT = "/Users/me/Projects/reader";
const status = (over: Partial<OriginStatus> = {}): OriginStatus => ({
  branch: "main",
  hasUpstream: true,
  ahead: 0,
  behind: 0,
  base: "",
  baseBehind: 0,
  conflicted: false,
  fetched: false,
  ...over,
});
const entry = () => useOriginStatus.getState().entries[ROOT];

beforeEach(() => {
  vi.useFakeTimers();
  useOriginStatus.getState().reset();
  useOriginStatus.getState().setStatus(ROOT, status({ behind: 3 }));
  mocks.status.mockResolvedValue(status());
  mocks.pull.mockResolvedValue(undefined);
  mocks.push.mockResolvedValue(undefined);
  mocks.merge.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("runOriginAction", () => {
  it("pulls, recounts, and confirms briefly", async () => {
    const run = runOriginAction(ROOT, { kind: "behind", behind: 3 });
    expect(entry().running).toBe(true);
    await run;

    expect(mocks.pull).toHaveBeenCalledWith(ROOT, "ff-only", ["--autostash"]);
    expect(mocks.status).toHaveBeenCalledWith(ROOT, false);
    expect(entry()).toMatchObject({ running: false, done: "Pulled 3", status: status() });

    vi.advanceTimersByTime(2500);
    expect(entry().done).toBeUndefined();
  });

  it("syncs by pulling first and pushing after", async () => {
    await runOriginAction(ROOT, { kind: "diverged", ahead: 2, behind: 1 });
    expect(mocks.pull).toHaveBeenCalledBefore(mocks.push);
    expect(entry().done).toBe("Synced");
  });

  it("updates a branch by merging origin's default branch into it", async () => {
    await runOriginAction(ROOT, { kind: "base", base: "main", behind: 12, onBase: false });
    expect(mocks.merge).toHaveBeenCalledWith(ROOT, "origin/main");
    expect(mocks.pull).not.toHaveBeenCalled();
  });

  it("reports a failure and shows what the repo looks like afterwards", async () => {
    mocks.pull.mockImplementation(() => {
      const failed = Promise.reject("Not possible to fast-forward, aborting.");
      failed.catch(() => {});
      return failed;
    });
    mocks.status.mockResolvedValue(status({ conflicted: true }));
    await runOriginAction(ROOT, { kind: "behind", behind: 3 });

    expect(mocks.toastError).toHaveBeenCalledWith("Pull failed: Not possible to fast-forward, aborting.");
    expect(entry()).toMatchObject({ running: false, done: undefined });
    expect(entry().status.conflicted).toBe(true);
  });

  it("ignores a second click while the first is running", async () => {
    const first = runOriginAction(ROOT, { kind: "behind", behind: 3 });
    await runOriginAction(ROOT, { kind: "behind", behind: 3 });
    await first;
    expect(mocks.pull).toHaveBeenCalledTimes(1);
  });
});

describe("recheckOrigin", () => {
  it("keeps the last reading when the check fails", async () => {
    mocks.status.mockImplementation(() => {
      const failed = Promise.reject("gone");
      failed.catch(() => {});
      return failed;
    });
    await recheckOrigin(ROOT, true);
    expect(entry().status.behind).toBe(3);
  });
});
