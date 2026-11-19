import { describe, expect, it } from "vitest";
import {
  isVideoSetUp,
  videoSetupAbout,
  videoSetupQueue,
  videoSetupRows,
  videoSetupStatus,
  type VideoSetupPart,
} from "./videoSetup";

const part = (id: VideoSetupPart["id"], ready: boolean, needsHomebrew = false): VideoSetupPart => ({
  id,
  ready,
  needsHomebrew,
});

const mostlyReady = [
  part("skill", false),
  part("node", true),
  part("ffmpeg", true),
  part("chromium", true),
  part("voice", false),
  part("xcodeTools", true),
];

describe("videoSetupRows", () => {
  it("hides Node.js when it's there", () => {
    expect(videoSetupRows(mostlyReady).map((p) => p.id)).toEqual(["skill", "ffmpeg", "chromium", "voice", "xcodeTools"]);
  });

  it("shows Node.js when it's missing", () => {
    expect(videoSetupRows([part("skill", true), part("node", false)]).map((p) => p.id)).toEqual(["skill", "node"]);
  });
});

describe("videoSetupQueue", () => {
  it("installs only what's missing", () => {
    expect(videoSetupQueue(mostlyReady)).toEqual(["skill", "voice"]);
  });

  it("skips what lpm can't install by itself", () => {
    expect(videoSetupQueue([part("ffmpeg", false, true), part("voice", false)])).toEqual(["voice"]);
  });
});

describe("isVideoSetUp", () => {
  it("is ready only when every part is", () => {
    expect(isVideoSetUp(mostlyReady)).toBe(false);
    expect(isVideoSetUp(mostlyReady.map((p) => ({ ...p, ready: true })))).toBe(true);
  });
});

describe("videoSetupStatus", () => {
  it("reads what a missing part will need", () => {
    expect(videoSetupStatus(part("skill", false))).toEqual({ label: "Will add", tone: "add" });
    expect(videoSetupStatus(part("voice", false)).label).toBe("About 1 GB");
    expect(videoSetupStatus(part("xcodeTools", false))).toEqual({ label: "Apple's installer", tone: "you" });
    expect(videoSetupStatus(part("ffmpeg", false, true)).label).toBe("Needs Homebrew");
    expect(videoSetupAbout(part("ffmpeg", false, true))).toBe("Needs Homebrew first, from brew.sh");
  });

  it("says which agent still needs a skill the other one has", () => {
    const forCodex = { ...part("skill", false), shareWith: "Codex" };
    expect(videoSetupStatus(forCodex)).toEqual({ label: "Add to Codex", tone: "add" });
    expect(videoSetupAbout(forCodex)).toBe("Already installed for Claude Code");
    expect(videoSetupAbout({ ...part("skill", false), shareWith: "Claude Code" })).toBe("Already installed for Codex");
    expect(videoSetupAbout(part("skill", false))).toBe("Writes and records the video · from GitHub");
    expect(videoSetupStatus(forCodex, "done").label).toBe("Installed");
  });

  it("follows an install as it runs", () => {
    expect(videoSetupStatus(part("skill", false), "installing").label).toBe("Installing…");
    expect(videoSetupStatus(part("xcodeTools", false), "installing").label).toBe("Waiting for Apple's installer");
    expect(videoSetupStatus(part("skill", false), "done")).toEqual({ label: "Installed", tone: "ok" });
    expect(videoSetupStatus(part("skill", false), "failed").tone).toBe("bad");
  });
});
