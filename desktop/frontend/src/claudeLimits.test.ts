import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  apply: vi.fn(),
  peerSet: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
}));

vi.mock("../bridge/commands", () => ({
  ApplyClaudeLimits: mocks.apply,
  PeerSettingsSet: mocks.peerSet,
  LoadSettings: mocks.load,
  SaveSettings: mocks.save,
}));

import { setClaudeLimitsEnabled } from "./claudeLimits";
import { useSettingsStore } from "./store/settings";

beforeEach(() => {
  mocks.calls.length = 0;
  mocks.apply.mockReset().mockImplementation(async () => void mocks.calls.push("apply"));
  mocks.peerSet.mockReset().mockResolvedValue({});
  mocks.load.mockReset().mockResolvedValue({});
  mocks.save.mockReset().mockImplementation(async () => void mocks.calls.push("save"));
  useSettingsStore.setState({ claudeLimitsEnabled: false });
});

describe("setClaudeLimitsEnabled", () => {
  it("installs the forwarder here before it saves the setting", async () => {
    await setClaudeLimitsEnabled(true);
    expect(mocks.calls).toEqual(["apply", "save"]);
    expect(mocks.apply).toHaveBeenCalledWith(true);
    expect(useSettingsStore.getState().claudeLimitsEnabled).toBe(true);
  });

  it("leaves the setting off when the forwarder can't be installed", async () => {
    mocks.apply.mockRejectedValue(new Error("no settings.json"));
    await expect(setClaudeLimitsEnabled(true)).rejects.toThrow("no settings.json");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(useSettingsStore.getState().claudeLimitsEnabled).toBe(false);
  });

  it("saves through the caller's own copy of the settings", async () => {
    const save = vi.fn(async () => void mocks.calls.push("caller"));
    await setClaudeLimitsEnabled(false, null, save);
    expect(mocks.calls).toEqual(["apply", "caller"]);
    expect(save).toHaveBeenCalledWith({ claudeLimitsEnabled: false });
  });

  it("leaves applying to a connected machine, which does it as it stores the setting", async () => {
    await setClaudeLimitsEnabled(true, "aabbccdd");
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.peerSet).toHaveBeenCalledWith("aabbccdd", { claudeLimitsEnabled: true });

    const save = vi.fn(async () => {});
    await setClaudeLimitsEnabled(false, "aabbccdd", save);
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith({ claudeLimitsEnabled: false });
  });
});
