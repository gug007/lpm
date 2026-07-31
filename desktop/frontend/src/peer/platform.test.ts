import { describe, expect, it } from "vitest";
import { isLinuxHost } from "./platform";

describe("isLinuxHost", () => {
  it("splits Linux hosts from Macs", () => {
    expect(isLinuxHost({ platform: "linux" })).toBe(true);
    expect(isLinuxHost({ platform: "macos" })).toBe(false);
  });

  // A peer paired before platforms were reported has nothing to go on until it
  // reconnects. It must stay with the Macs rather than move on a guess.
  it("treats an unreported platform as a Mac", () => {
    expect(isLinuxHost({ platform: "" })).toBe(false);
    expect(isLinuxHost({})).toBe(false);
  });

  // Whatever a future build reports, only an exact "linux" moves a row.
  it("does not match a platform it doesn't know", () => {
    expect(isLinuxHost({ platform: "Linux" })).toBe(false);
    expect(isLinuxHost({ platform: "freebsd" })).toBe(false);
  });
});
