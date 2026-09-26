// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectInfo } from "../types";

const mocks = vi.hoisted(() => ({ status: vi.fn(), eventsOn: vi.fn(() => () => {}) }));

vi.mock("../../bridge/commands", () => ({ GitOriginStatus: mocks.status }));
vi.mock("../../bridge/runtime", () => ({ EventsOn: mocks.eventsOn }));

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
  useOriginStatus.getState().reset();
  mocks.status.mockImplementation(async () => ({
    branch: "main", hasUpstream: true, ahead: 0, behind: 2, base: "", baseBehind: 0, conflicted: false, fetched: true,
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

  it("clears every mark when switched off", async () => {
    act(() => root.render(<Harness enabled />));
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    act(() => root.render(<Harness enabled={false} />));
    expect(useOriginStatus.getState().entries).toEqual({});
  });
});
