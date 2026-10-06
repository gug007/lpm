import { beforeEach, describe, expect, it, vi } from "vitest";

const handlers = new Map<string, (payload: unknown) => void>();
const offs = new Map<string, ReturnType<typeof vi.fn>>();

vi.mock("../../bridge/runtime", () => ({
  EventsOnReady: vi.fn(async (name: string, callback: (payload: unknown) => void) => {
    handlers.set(name, callback);
    const off = vi.fn(() => handlers.delete(name));
    offs.set(name, off);
    return off;
  }),
}));

import { captureActionRun } from "./actionRunCapture";

describe("captureActionRun", () => {
  beforeEach(() => {
    handlers.clear();
    offs.clear();
  });

  it("keeps output and the result that arrive before anything renders", async () => {
    const run = await captureActionRun();
    handlers.get("action-output")?.({ line: "quick-out" });
    handlers.get("action-done")?.({ success: true, error: "" });
    expect(run.snapshot()).toEqual({ lines: ["quick-out"], done: { success: true, error: "" } });
  });

  it("tells subscribers about each change and stops listening once disposed", async () => {
    const run = await captureActionRun();
    const seen = vi.fn();
    const unsubscribe = run.subscribe(seen);
    handlers.get("action-output")?.({ line: "a" });
    unsubscribe();
    handlers.get("action-output")?.({ line: "b" });
    expect(seen).toHaveBeenCalledTimes(1);
    expect(run.snapshot().lines).toEqual(["a", "b"]);
    run.dispose();
    expect(offs.get("action-output")).toHaveBeenCalled();
    expect(offs.get("action-done")).toHaveBeenCalled();
  });
});
