import { describe, expect, it } from "vitest";
import {
  macUpdateLine,
  reconnectOutcome,
  updateTarget,
  withProgress,
  type MacUpdate,
} from "./macUpdate";

const behind = { connected: true, supportsSelfUpdate: true, version: "1.42.0" };

function update(change: Partial<MacUpdate> = {}): MacUpdate {
  return {
    name: "Studio Mac",
    phase: "checking",
    progress: -1,
    from: "1.42.0",
    target: "1.43.0",
    installed: false,
    cancelling: false,
    ...change,
  };
}

describe("updateTarget", () => {
  it("is this Mac's release unless a newer one is known", () => {
    expect(updateTarget("1.43.0", "")).toBe("1.43.0");
    expect(updateTarget("1.43.0", "1.44.1")).toBe("1.44.1");
    expect(updateTarget("1.43.0", "1.42.0")).toBe("1.43.0");
  });
});

describe("macUpdateLine", () => {
  it("offers the update to a Mac that is behind", () => {
    expect(macUpdateLine(undefined, behind, "1.43.0")).toEqual({
      kind: "available",
      text: "lpm 1.42.0 ·",
      action: { kind: "update", label: "Update to 1.43.0" },
    });
  });

  it("offers nothing to a Mac that is current, away, too old to ask, or unversioned", () => {
    expect(macUpdateLine(undefined, { ...behind, version: "1.43.0" }, "1.43.0")).toBeNull();
    expect(macUpdateLine(undefined, { ...behind, connected: false }, "1.43.0")).toBeNull();
    expect(macUpdateLine(undefined, { ...behind, supportsSelfUpdate: false }, "1.43.0")).toBeNull();
    expect(macUpdateLine(undefined, { ...behind, version: "dev" }, "1.43.0")).toBeNull();
    expect(macUpdateLine(undefined, behind, "")).toBeNull();
  });

  it("can be cancelled until the app starts being replaced", () => {
    expect(macUpdateLine(update({ phase: "downloading", progress: 62 }), behind, "1.43.0")).toEqual({
      kind: "busy",
      text: "Downloading 1.43.0 · 62% ·",
      action: { kind: "cancel", label: "Cancel" },
    });
    expect(macUpdateLine(update({ phase: "installing" }), behind, "1.43.0")?.action).toBeUndefined();
    expect(macUpdateLine(update({ cancelling: true }), behind, "1.43.0")).toEqual({
      kind: "busy",
      text: "Cancelling…",
    });
  });

  it("calls a drop after the install a restart, and any other a reconnect", () => {
    const restarting = update({ phase: "reconnecting", installed: true });
    expect(macUpdateLine(restarting, behind, "1.43.0")?.text).toBe("Restarting lpm there…");
    expect(macUpdateLine(update({ phase: "reconnecting" }), behind, "1.43.0")?.text).toBe(
      "Reconnecting…",
    );
  });

  it("names the release that actually landed", () => {
    const line = macUpdateLine(update({ phase: "done" }), { ...behind, version: "1.44.0" }, "1.43.0");
    expect(line).toEqual({ kind: "done", text: "Updated to 1.44.0" });
  });
});

describe("withProgress", () => {
  it("follows the steps the Mac reports", () => {
    const downloading = withProgress(update(), { phase: "downloading" });
    expect(downloading.phase).toBe("downloading");
    expect(withProgress(downloading, { progress: 40 }).progress).toBe(40);
    const installing = withProgress(downloading, { phase: "installing" });
    expect(installing).toMatchObject({ phase: "installing", installed: true });
  });

  it("ignores steps once the connection has dropped", () => {
    const gone = update({ phase: "reconnecting" });
    expect(withProgress(gone, { phase: "downloading", progress: 10 })).toBe(gone);
  });
});

describe("reconnectOutcome", () => {
  const away = update({ phase: "reconnecting", installed: true });

  it("waits while the Mac is still away", () => {
    expect(reconnectOutcome(away, { connected: false })).toBe("waiting");
  });

  it("has landed once the Mac reports another release", () => {
    expect(reconnectOutcome(away, { connected: true, version: "1.43.0" })).toBe("landed");
  });

  it("is lost when the Mac comes back on the release it started from", () => {
    expect(reconnectOutcome(away, { connected: true, version: "1.42.0" })).toBe("lost");
  });

  it("says nothing about an update that never lost its connection", () => {
    expect(reconnectOutcome(update(), { connected: true, version: "1.43.0" })).toBe("waiting");
  });
});
