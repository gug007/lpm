// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectInfo } from "../types";

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  eventsOn: vi.fn(() => () => {}),
  autoPull: vi.fn(async () => {}),
  watchRefs: vi.fn(async () => {}),
  stopFollowing: vi.fn(),
  follow: vi.fn(),
}));

vi.mock("../../bridge/commands", () => ({ GitOriginStatus: mocks.status, WatchOriginRefs: mocks.watchRefs }));
vi.mock("../../bridge/runtime", () => ({ EventsOn: mocks.eventsOn }));
vi.mock("../autoPullRun", () => ({ maybeAutoPull: mocks.autoPull }));
vi.mock("../originSpread", () => ({ followOriginMoves: mocks.follow }));

import { FETCH_EVERY_MS, originRoots, useOriginStatusPoller } from "./useOriginStatusPoller";
import { useOriginStatus } from "../store/originStatus";

const project = (name: string, root: string, over: Partial<ProjectInfo> = {}): ProjectInfo =>
  ({ name, root, isRemote: false, running: false, ...over }) as ProjectInfo;

const PROJECTS = [
  project("reader", "/p/reader"),
  project("lpm", "/p/lpm"),
  project("lpm-copy", "/p/lpm"),
  project("box", "/srv/box", { isRemote: true }),
  project("broken", "/p/broken", { configError: "bad yaml" }),
];

function Harness({ enabled }: { enabled: boolean }) {
  useOriginStatusPoller(PROJECTS, enabled);
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  mocks.follow.mockReturnValue(mocks.stopFollowing);
  useOriginStatus.getState().reset();
  mocks.status.mockImplementation(async () => ({
    branch: "main", hasUpstream: true, ahead: 0, behind: 2, base: "", baseBehind: 0, conflicted: false, changes: 0, fetched: true,
  }));
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("originRoots", () => {
  it("keeps local projects that load, once per folder", () => {
    expect(originRoots(PROJECTS)).toEqual(["/p/lpm", "/p/reader"]);
  });

  it("checks a connected Mac's projects too, after this Mac's own", () => {
    const remote = project("peer-aabbccdd-api", "/@peer-aabbccdd/Users/g/api");
    const remoteSsh = project("peer-aabbccdd-box", "/@peer-aabbccdd/srv/box", { isRemote: true });
    expect(originRoots([remote, remoteSsh, ...PROJECTS])).toEqual([
      "/p/lpm",
      "/p/reader",
      "/@peer-aabbccdd/Users/g/api",
    ]);
  });
});

describe("useOriginStatusPoller", () => {
  it("fetches each project once after startup, then only recounts until the next round", async () => {
    act(() => root.render(<Harness enabled />));
    expect(mocks.status).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(mocks.status.mock.calls).toEqual([["/p/lpm", true], ["/p/reader", true]]);
    expect(useOriginStatus.getState().entries["/p/reader"].status.behind).toBe(2);

    mocks.status.mockClear();
    await act(async () => { await vi.advanceTimersByTimeAsync(FETCH_EVERY_MS); });
    expect(mocks.status.mock.calls).toEqual([["/p/lpm", true], ["/p/reader", true]]);
  });

  it("offers each project an auto pull right after its check", async () => {
    act(() => root.render(<Harness enabled />));
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(mocks.autoPull.mock.calls).toEqual([["/p/lpm"], ["/p/reader"]]);
  });

  it("recounts on working-tree edits only while the project shows a mark", async () => {
    act(() => root.render(<Harness enabled />));
    const calls = mocks.eventsOn.mock.calls as unknown as [string, (payload: unknown) => void][];
    const onGitChanged = calls.find(([event]) => event === "git-changed")![1];
    const edit = async () => {
      act(() => onGitChanged({ path: "/p/reader", files: ["src/a.ts"] }));
      await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
    };

    await edit();
    expect(mocks.status).not.toHaveBeenCalled();

    const behind = await mocks.status();
    mocks.status.mockClear();
    act(() => useOriginStatus.getState().setStatus("/p/reader", behind));
    await edit();
    expect(mocks.status).toHaveBeenCalledWith("/p/reader", false);
    expect(mocks.autoPull).toHaveBeenCalledWith("/p/reader");
  });

  it("watches the remote refs of this Mac's own projects, and follows origin moves, while on", () => {
    const peer = project("peer-aabbccdd-api", "/@peer-aabbccdd/Users/g/api");
    function WithPeer({ enabled }: { enabled: boolean }) {
      useOriginStatusPoller([...PROJECTS, peer], enabled);
      return null;
    }
    act(() => root.render(<WithPeer enabled />));
    expect(mocks.watchRefs).toHaveBeenLastCalledWith(["/p/lpm", "/p/reader"]);
    expect(mocks.follow).toHaveBeenCalledTimes(1);

    act(() => root.render(<WithPeer enabled={false} />));
    expect(mocks.watchRefs).toHaveBeenLastCalledWith([]);
    expect(mocks.stopFollowing).toHaveBeenCalledTimes(1);
  });

  it("clears every mark when switched off", async () => {
    act(() => root.render(<Harness enabled />));
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    act(() => root.render(<Harness enabled={false} />));
    expect(useOriginStatus.getState().entries).toEqual({});
  });
});
