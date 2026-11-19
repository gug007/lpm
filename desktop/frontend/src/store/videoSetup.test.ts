import { beforeEach, describe, expect, it, vi } from "vitest";
import { VIDEO_SETUP_PARTS, type VideoSetupPart } from "../videoSetup";

const bridge = vi.hoisted(() => ({
  check: vi.fn<() => Promise<VideoSetupPart[]>>(),
  install: vi.fn<(part: string) => Promise<void>>(),
}));
vi.mock("../../bridge/commands", () => ({
  VideoSetupCheck: () => bridge.check(),
  VideoSetupInstall: (part: string) => bridge.install(part),
}));
vi.mock("../notifications/toast", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

import { ensureVideoReady, installVideoSetup, useVideoSetup } from "./videoSetup";
import { useVideoAnswer } from "./videoAnswer";

const all = (ready: boolean): VideoSetupPart[] =>
  VIDEO_SETUP_PARTS.map((id) => ({
    id,
    ready: ready || id === "node" || id === "ffmpeg",
    needsHomebrew: false,
  }));

beforeEach(() => {
  bridge.check.mockReset();
  bridge.install.mockReset();
  useVideoSetup.setState({ parts: null, open: false, turnOnFor: null, running: false, runs: {}, errors: {} });
  useVideoAnswer.setState({ on: {} });
});

describe("ensureVideoReady", () => {
  it("lets the click through when everything is there, and stops checking", async () => {
    bridge.check.mockResolvedValue(all(true));
    expect(await ensureVideoReady("t1")).toBe(true);
    expect(await ensureVideoReady("t1")).toBe(true);
    expect(bridge.check).toHaveBeenCalledTimes(1);
    expect(useVideoSetup.getState().open).toBe(false);
  });

  it("opens the window for the terminal that asked when something's missing", async () => {
    bridge.check.mockResolvedValue(all(false));
    expect(await ensureVideoReady("t1")).toBe(false);
    expect(useVideoSetup.getState()).toMatchObject({ open: true, turnOnFor: "t1" });
  });

  it("doesn't stand in the way when the Mac can't be checked", async () => {
    bridge.check.mockRejectedValue("nope");
    expect(await ensureVideoReady("t1")).toBe(true);
  });
});

describe("installVideoSetup", () => {
  it("installs the missing parts in order, then turns Video on where it was asked", async () => {
    bridge.check.mockResolvedValueOnce(all(false)).mockResolvedValueOnce(all(true));
    await ensureVideoReady("t1");
    bridge.install.mockResolvedValue(undefined);
    await installVideoSetup();
    expect(bridge.install.mock.calls.map(([p]) => p)).toEqual(["skill", "chromium", "voice", "xcodeTools"]);
    expect(useVideoAnswer.getState().on).toEqual({ t1: true });
    expect(useVideoSetup.getState()).toMatchObject({ running: false, open: false, turnOnFor: null });
  });

  it("keeps going past a part that fails and leaves the window saying which", async () => {
    bridge.check.mockResolvedValueOnce(all(false)).mockResolvedValueOnce(all(false));
    await ensureVideoReady("t1");
    bridge.install.mockImplementation(async (p) => {
      if (p === "chromium") throw "no network";
    });
    await installVideoSetup();
    expect(bridge.install).toHaveBeenCalledTimes(4);
    const s = useVideoSetup.getState();
    expect(s.runs.chromium).toBe("failed");
    expect(s.errors.chromium).toBe("no network");
    expect(s.runs.voice).toBe("done");
    expect(s.open).toBe(true);
    expect(useVideoAnswer.getState().on).toEqual({});
  });
});
