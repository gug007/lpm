import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateMac: vi.fn(),
  cancelMacUpdate: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("../../bridge/commands", () => ({
  PeerUpdateMac: mocks.updateMac,
  PeerCancelMacUpdate: mocks.cancelMacUpdate,
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));

import {
  cancelMacUpdate,
  noteMacUpdateProgress,
  reconcileMacUpdates,
  startMacUpdate,
  useMacUpdates,
} from "./macUpdates";

const SLUG = "aabbccdd";
const current = () => useMacUpdates.getState()[SLUG];

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  useMacUpdates.setState({}, true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startMacUpdate", () => {
  it("restarts into the new release and says so", async () => {
    mocks.updateMac.mockResolvedValue("disconnected");
    const run = startMacUpdate(SLUG, "Studio Mac", "1.42.0", "1.43.0");
    noteMacUpdateProgress({ slug: SLUG, phase: "installing" });
    await run;
    expect(current()).toMatchObject({ phase: "reconnecting", installed: true });

    reconcileMacUpdates([{ slug: SLUG, connected: true, version: "1.43.0" }]);
    expect(current()?.phase).toBe("done");
    expect(mocks.toast.success).toHaveBeenCalledWith("Studio Mac is on lpm 1.43.0");

    vi.advanceTimersByTime(5000);
    expect(current()).toBeUndefined();
  });

  it("clears and reports a failure on the Mac", async () => {
    mocks.updateMac.mockRejectedValue("An update is already in progress.");
    await startMacUpdate(SLUG, "Studio Mac", "1.42.0", "1.43.0");
    expect(current()).toBeUndefined();
    expect(mocks.toast.error).toHaveBeenCalledWith("Couldn't update Studio Mac", {
      description: "An update is already in progress.",
    });
  });

  it("clears quietly once cancelled", async () => {
    let finish: (outcome: string) => void = () => {};
    mocks.updateMac.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    mocks.cancelMacUpdate.mockResolvedValue(true);
    const run = startMacUpdate(SLUG, "Studio Mac", "1.42.0", "1.43.0");
    await cancelMacUpdate(SLUG);
    expect(current()?.cancelling).toBe(true);
    finish("cancelled");
    await run;
    expect(current()).toBeUndefined();
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("starts nothing while one is already running there", async () => {
    mocks.updateMac.mockReturnValue(new Promise(() => {}));
    void startMacUpdate(SLUG, "Studio Mac", "1.42.0", "1.43.0");
    void startMacUpdate(SLUG, "Studio Mac", "1.42.0", "1.43.0");
    expect(mocks.updateMac).toHaveBeenCalledTimes(1);
  });
});

describe("reconcileMacUpdates", () => {
  it("says so when a restarted Mac comes back without the update", async () => {
    mocks.updateMac.mockResolvedValue("disconnected");
    const run = startMacUpdate(SLUG, "Studio Mac", "1.42.0", "1.43.0");
    noteMacUpdateProgress({ slug: SLUG, phase: "installing" });
    await run;
    reconcileMacUpdates([{ slug: SLUG, connected: true, version: "1.42.0" }]);
    expect(current()).toBeUndefined();
    expect(mocks.toast.error).toHaveBeenCalledWith("Studio Mac restarted without updating");
  });

  it("gives up on a Mac that never comes back", async () => {
    mocks.updateMac.mockResolvedValue("disconnected");
    await startMacUpdate(SLUG, "Studio Mac", "1.42.0", "1.43.0");
    reconcileMacUpdates([{ slug: SLUG, connected: false, version: "1.42.0" }]);
    vi.advanceTimersByTime(3 * 60 * 1000);
    expect(current()).toBeUndefined();
    expect(mocks.toast.error).toHaveBeenCalledTimes(1);
  });

  it("forgets an update on a Mac that is no longer paired", async () => {
    mocks.updateMac.mockReturnValue(new Promise(() => {}));
    void startMacUpdate(SLUG, "Studio Mac", "1.42.0", "1.43.0");
    reconcileMacUpdates([]);
    expect(current()).toBeUndefined();
  });
});
