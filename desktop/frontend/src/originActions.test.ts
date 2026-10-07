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

import { pullDeck, recheckOrigin, runOriginAction } from "./originActions";
import { useDeckPull } from "./store/deckPull";
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
  useDeckPull.getState().reset();
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

describe("pullDeck", () => {
  const COPY = "/Users/me/Projects/reader-copy";
  const AHEAD = "/Users/me/Projects/reader-ahead";
  const deck = [
    { root: ROOT, name: "reader", isParent: true },
    { root: COPY, name: "reader-copy" },
    { root: AHEAD, name: "reader-ahead" },
  ];
  const pulls = () => useDeckPull.getState().decks.reader;

  beforeEach(() => {
    useOriginStatus.getState().setStatus(COPY, status({ behind: 1 }));
    useOriginStatus.getState().setStatus(AHEAD, status({ ahead: 2, behind: 1 }));
  });

  it("pulls the rows that only need a pull, side by side, then steps away", async () => {
    let inFlight = 0;
    let most = 0;
    mocks.pull.mockImplementation(async () => {
      most = Math.max(most, ++inFlight);
      await Promise.resolve();
      inFlight--;
    });
    const run = pullDeck("reader", deck);
    expect(pulls()).toMatchObject({ total: 2, done: 0, running: true });
    await run;

    expect(mocks.pull.mock.calls.map((call) => call[0])).toEqual([ROOT, COPY]);
    expect(most).toBe(2);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(pulls()).toMatchObject({ total: 2, done: 2, running: false, failed: [] });

    vi.advanceTimersByTime(2500);
    expect(pulls()).toBeUndefined();
  });

  it("pulls the parent and its worktrees one at a time, beside the copies", async () => {
    const TREES = ["/Users/me/Projects/reader-a", "/Users/me/Projects/reader-b"];
    for (const tree of TREES) useOriginStatus.getState().setStatus(tree, status({ behind: 1 }));
    const inFlight = new Set<string>();
    let most = 0;
    let mostShared = 0;
    mocks.pull.mockImplementation(async (root: string) => {
      inFlight.add(root);
      most = Math.max(most, inFlight.size);
      mostShared = Math.max(mostShared, [ROOT, ...TREES].filter((r) => inFlight.has(r)).length);
      await Promise.resolve();
      inFlight.delete(root);
    });
    await pullDeck("reader", [
      ...deck,
      ...TREES.map((root) => ({ root, name: root, worktree: true })),
    ]);

    expect(mocks.pull).toHaveBeenCalledTimes(4);
    expect(most).toBe(2);
    expect(mostShared).toBe(1);
    expect(pulls()).toMatchObject({ total: 4, done: 4, running: false, failed: [] });
  });

  it("keeps going past a failure, names it, and keeps it for Retry", async () => {
    mocks.pull.mockImplementation((root: string) => {
      if (root !== ROOT) return Promise.resolve();
      const failed = Promise.reject("Your local changes would be overwritten by merge");
      failed.catch(() => {});
      return failed;
    });
    await pullDeck("reader", deck);

    expect(mocks.pull).toHaveBeenCalledTimes(2);
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Pull failed in reader: Your local changes would be overwritten by merge",
    );
    vi.advanceTimersByTime(2500);
    expect(pulls()).toMatchObject({ running: false, failed: [ROOT] });
  });

  it("leaves a row alone once its own button is already pulling it", async () => {
    useOriginStatus.getState().setRunning(COPY, true);
    await pullDeck("reader", deck);
    expect(mocks.pull.mock.calls.map((call) => call[0])).toEqual([ROOT]);
  });

  it("does nothing while the deck is already being pulled", async () => {
    const first = pullDeck("reader", deck);
    await pullDeck("reader", deck);
    await first;
    expect(mocks.pull).toHaveBeenCalledTimes(2);
  });
});
