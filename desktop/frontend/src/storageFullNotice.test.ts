import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("./notifications/toast", () => ({ toast }));

const FULL = 'No space left on device (os error 28) at path "/Users/alice/.lpm/.tmps1Msgr"';

function reject(reason: unknown) {
  window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason }));
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal("window", new EventTarget());
  (await import("./storageFullNotice")).initStorageFullNotice();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("the full disk notice", () => {
  it("tells the person when a save nothing answered for had no room", () => {
    reject(FULL);

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error.mock.calls[0][0]).toBe("Not enough disk space");
  });

  it("says nothing about other failures", () => {
    reject(new Error("boom"));

    expect(toast.error).not.toHaveBeenCalled();
  });

  it("doesn't come back for every save that fails after it", () => {
    reject(FULL);
    vi.advanceTimersByTime(60_000);
    reject(new Error(FULL));
    expect(toast.error).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10 * 60_000);
    reject(FULL);
    expect(toast.error).toHaveBeenCalledTimes(2);
  });
});
