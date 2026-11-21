// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrMergeWatch } from "../types";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (payload: unknown) => void>(),
  success: vi.fn(),
  error: vi.fn(),
  afterMerge: vi.fn(),
}));
vi.mock("../../bridge/runtime", () => ({
  EventsOn: (name: string, fn: (payload: unknown) => void) => {
    mocks.handlers.set(name, fn);
    return () => mocks.handlers.delete(name);
  },
}));
vi.mock("../notifications/toast", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("../prMergeDone", () => ({ afterMerge: mocks.afterMerge }));

import { usePrMergeWatch } from "../store/prMergeWatch";
import { usePrMergeWatchEvents } from "./usePrMergeWatchEvents";

function Probe() {
  usePrMergeWatchEvents();
  return null;
}

const WAITING: PrMergeWatch = {
  path: "/p",
  number: 174,
  title: "Add merging",
  method: "squash",
  deleteBranch: true,
  bypass: true,
  state: "waiting",
  deletedBranch: false,
};

afterEach(() => {
  usePrMergeWatch.setState({ watches: {} });
  vi.clearAllMocks();
});

describe("usePrMergeWatchEvents", () => {
  it("tracks a wait and says how it ended", () => {
    const root = createRoot(document.createElement("div"));
    act(() => root.render(<Probe />));
    const emit = (watch: PrMergeWatch) => act(() => mocks.handlers.get("pr-merge-watch")!(watch));

    emit(WAITING);
    expect(usePrMergeWatch.getState().watches["/p"]).toEqual(WAITING);

    emit({ ...WAITING, state: "merged", deletedBranch: true });
    expect(usePrMergeWatch.getState().watches["/p"]).toBeUndefined();
    expect(mocks.afterMerge).toHaveBeenCalledWith("/p", 174, true);

    emit(WAITING);
    emit({ ...WAITING, state: "stopped", reason: "smoke failed." });
    expect(mocks.error).toHaveBeenCalledWith("Stopped waiting to merge #174", {
      description: "smoke failed.",
      event: "ci",
    });
    expect(usePrMergeWatch.getState().watches["/p"]).toBeUndefined();

    emit(WAITING);
    emit({ ...WAITING, state: "cancelled" });
    expect(mocks.error).toHaveBeenCalledTimes(1);
    expect(mocks.success).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
