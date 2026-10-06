import { describe, expect, it } from "vitest";
import { connectsOnlyToMacs, isLinuxHost, managesHostInstall, peerNoun } from "./platform";

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

  // Linux is a desktop too now: only a machine nobody is at is a server.
  it("keeps a Linux desktop with the machines people sit at", () => {
    expect(isLinuxHost({ platform: "linux", headless: false })).toBe(false);
    expect(isLinuxHost({ platform: "linux", headless: true })).toBe(true);
    expect(isLinuxHost({ platform: "windows", headless: false })).toBe(false);
  });

  // A host from before `headless` was reported only ever ran headless.
  it("reads a Linux peer that doesn't say as a host", () => {
    expect(isLinuxHost({ platform: "linux", headless: null })).toBe(true);
    expect(isLinuxHost({ platform: "linux", headless: undefined })).toBe(true);
  });
});

describe("managesHostInstall", () => {
  it("is for a host reached over SSH", () => {
    expect(managesHostInstall({ platform: "linux", headless: true, sshHost: "root@box" })).toBe(true);
    expect(managesHostInstall({ platform: "linux", headless: null, sshHost: "root@box" })).toBe(true);
    expect(managesHostInstall({ platform: "linux", headless: true })).toBe(false);
  });

  // Freshly added over SSH, before its first connect reports anything.
  it("keeps an unreported SSH peer a host, as it always was", () => {
    expect(managesHostInstall({ sshHost: "root@box" })).toBe(true);
  });

  // The host installer on a desktop would put a second lpm beside its own.
  it("never installs over a Linux or Windows desktop", () => {
    expect(managesHostInstall({ platform: "linux", headless: false, sshHost: "me@ws" })).toBe(false);
    expect(managesHostInstall({ platform: "windows", headless: false, sshHost: "me@pc" })).toBe(false);
    expect(managesHostInstall({ platform: "windows", sshHost: "me@pc" })).toBe(false);
  });

  it("leaves a Mac reached over SSH the actions it always had", () => {
    expect(managesHostInstall({ platform: "macos", sshHost: "me@mac" })).toBe(true);
    expect(managesHostInstall({ platform: "macos", headless: false, sshHost: "me@mac" })).toBe(true);
    expect(managesHostInstall({ platform: "macos", headless: false })).toBe(false);
  });
});

describe("peerNoun", () => {
  it("names each kind of machine", () => {
    expect(peerNoun({ platform: "macos" })).toBe("Mac");
    expect(peerNoun({})).toBe("Mac");
    expect(peerNoun({ platform: "linux" })).toBe("server");
    expect(peerNoun({ platform: "linux", headless: false })).toBe("computer");
    expect(peerNoun({ platform: "windows", headless: false })).toBe("computer");
  });
});

describe("connectsOnlyToMacs", () => {
  it("goes by this computer while nothing is paired", () => {
    expect(connectsOnlyToMacs([], true)).toBe(true);
    expect(connectsOnlyToMacs([], false)).toBe(false);
  });

  it("goes by what is paired once anything is", () => {
    expect(connectsOnlyToMacs([{ platform: "macos" }], false)).toBe(true);
    expect(connectsOnlyToMacs([{ platform: "macos" }, { platform: "windows", headless: false }], true)).toBe(false);
  });
});
