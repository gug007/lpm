// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CiFixLoop } from "../types";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (payload: unknown) => void>(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("../../bridge/runtime", () => ({
  EventsOn: (name: string, fn: (payload: unknown) => void) => {
    mocks.handlers.set(name, fn);
    return () => mocks.handlers.delete(name);
  },
}));
vi.mock("../notifications/toast", () => ({ toast: { success: mocks.success, error: mocks.error } }));

import { fixLoopRunning, useCiFixLoops } from "../store/ciFixLoop";
import { useCiFixLoopEvents } from "./useCiFixLoopEvents";

function Probe() {
  useCiFixLoopEvents();
  return null;
}

const WATCHING: CiFixLoop = {
  project: "storefront",
  agent: "Claude",
  branch: "checkout",
  round: 2,
  maxRounds: 3,
  state: "watching",
  sha: "7c41e2a",
  detail: "Claude pushed 7c41e2a · watching the new run",
  progress: 0.55,
};

afterEach(() => {
  useCiFixLoops.setState({ loops: {} });
  vi.clearAllMocks();
});

describe("useCiFixLoopEvents", () => {
  it("follows a loop and says once how it ended", () => {
    const root = createRoot(document.createElement("div"));
    act(() => root.render(<Probe />));
    const emit = (loop: CiFixLoop) => act(() => mocks.handlers.get("ci-fix-loop")!(loop));

    emit(WATCHING);
    expect(fixLoopRunning(useCiFixLoops.getState().loops.storefront)).toBe(true);
    expect(mocks.success).not.toHaveBeenCalled();

    emit({ ...WATCHING, state: "passed", detail: "CI passed after 2 rounds", progress: 1 });
    expect(fixLoopRunning(useCiFixLoops.getState().loops.storefront)).toBe(false);
    expect(mocks.success).toHaveBeenCalledWith("CI passed after 2 rounds", expect.objectContaining({ event: "ci" }));

    emit({ ...WATCHING, state: "stopped", detail: "Claude is asking you something." });
    expect(mocks.error).toHaveBeenCalledWith(
      "Stopped fixing CI",
      expect.objectContaining({ description: "Claude is asking you something." }),
    );

    emit({ ...WATCHING, state: "cancelled", detail: "Stopped" });
    expect(mocks.error).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});
