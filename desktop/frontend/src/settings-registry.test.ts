import { describe, expect, it } from "vitest";
import {
  buildSearchEntries,
  matchSettings,
  visibleNavGroups,
  type SettingsSearchEntry,
} from "./settings-registry";
import type { PeerMachine } from "./settingsMachine";

const withTTS = buildSearchEntries({ experimentalTTS: true });
const withoutTTS = buildSearchEntries({ experimentalTTS: false });

function ids(entries: SettingsSearchEntry[]): string[] {
  return entries.map((e) => e.id);
}

describe("buildSearchEntries", () => {
  it("omits Text to Speech rows when experimentalTTS is off", () => {
    expect(ids(withoutTTS)).not.toContain("tts.enable");
    expect(ids(withTTS)).toContain("tts.enable");
  });

  it("omits rows backed by macOS-only features elsewhere", () => {
    const pc = ids(buildSearchEntries({ experimentalTTS: true, mac: false }));
    expect(pc).not.toContain("ai.voiceToText");
    expect(pc).toContain("general.removeApp");
    expect(pc).toContain("general.updates");
    expect(ids(withTTS)).toEqual(expect.arrayContaining(["general.removeApp", "ai.voiceToText"]));
  });

  it("indexes dynamic shortcut and sound rows from their source arrays", () => {
    expect(ids(withTTS)).toEqual(
      expect.arrayContaining([
        "shortcut.renameProject",
        "shortcut.tabSwitchNext",
        "sound.done",
      ]),
    );
  });
});

describe("matchSettings", () => {
  it("returns nothing for an empty query", () => {
    expect(matchSettings(withTTS, "")).toEqual([]);
    expect(matchSettings(withTTS, "   ")).toEqual([]);
  });

  it("ranks a label match above a description/keyword match", () => {
    const results = matchSettings(withTTS, "theme");
    const themeLabels = results.filter((r) => r.label.toLowerCase() === "theme");
    expect(themeLabels.length).toBeGreaterThanOrEqual(2);
    // The two "Theme" rows (general + terminal) must come before any entry that
    // only matches "theme" via its description.
    expect(results[0].label).toBe("Theme");
    expect(results[1].label).toBe("Theme");
  });

  it("matches on keywords that are absent from the label and description", () => {
    const results = matchSettings(withTTS, "upgrade");
    expect(ids(results)).toContain("general.updates");
  });

  it("matches rows via their tab title", () => {
    const results = matchSettings(withTTS, "general");
    expect(ids(results)).toContain("general.theme");
  });

  it("is case-insensitive", () => {
    expect(ids(matchSettings(withTTS, "TEMPLATES"))).toContain("templates.list");
    expect(ids(matchSettings(withTTS, "templates"))).toContain("templates.list");
  });

  it("finds keep awake in both the Phone and Connections panes", () => {
    expect(ids(matchSettings(withTTS, "caffeinate"))).toEqual(
      expect.arrayContaining(["mobile.keepAwake", "connections.keepAwake"]),
    );
  });

  it("excludes filtered-out entries from results", () => {
    expect(ids(matchSettings(withoutTTS, "kokoro"))).not.toContain("tts.enable");
    expect(ids(matchSettings(withTTS, "kokoro"))).toContain("tts.enable");
  });
});

const studio: PeerMachine = {
  kind: "peer",
  slug: "aabbccdd",
  name: "Studio",
  attended: true,
  mac: true,
  version: "0.7.20",
};
const server: PeerMachine = { ...studio, name: "build-box", attended: false, mac: false };

function tabs(machine?: PeerMachine, experimentalTTS = false): string[] {
  return visibleNavGroups({ experimentalTTS }, machine).flatMap((group) =>
    group.items.map((item) => (item.kind === "tab" ? item.tab : item.view)),
  );
}

describe("a connected machine's settings", () => {
  it("lists every page on this machine", () => {
    expect(tabs()).toEqual([
      "general",
      "notifications",
      "terminal",
      "shortcuts",
      "agents",
      "accounts",
      "git",
      "templates",
      "backup",
      "global-config",
      "mobile",
      "connections",
    ]);
  });

  it("lists only the pages with something to change on a Mac someone uses", () => {
    expect(tabs(studio)).toEqual([
      "general",
      "notifications",
      "terminal",
      "shortcuts",
      "agents",
      "accounts",
      "git",
      "templates",
      "global-config",
      "mobile",
    ]);
    expect(tabs(studio, true)).toContain("tts");
  });

  it("lists only what a machine nobody sits at runs by", () => {
    expect(tabs(server, true)).toEqual([
      "general",
      "notifications",
      "agents",
      "accounts",
      "git",
      "templates",
      "global-config",
      "mobile",
    ]);
  });

  it("searches only the rows the machine has", () => {
    const onStudio = ids(buildSearchEntries({ experimentalTTS: true, mac: true, machine: studio }));
    expect(onStudio).toEqual(
      expect.arrayContaining(["general.theme", "general.autoPull", "terminal.fontSize", "shortcut.renameProject", "sound.done"]),
    );
    expect(onStudio).not.toContain("general.removeApp");
    expect(onStudio).not.toContain("backup.export");
    expect(onStudio).toContain("mobile.keepAwake");
    expect(onStudio).not.toContain("connections.keepAwake");
    expect(onStudio).toContain("tts.openaiKey");
    expect(onStudio).toContain("global-config");
    expect(onStudio).not.toContain("usage");

    const onServer = ids(buildSearchEntries({ experimentalTTS: true, mac: true, machine: server }));
    expect(onServer).toEqual(
      expect.arrayContaining(["general.checkOrigin", "general.defaultDir", "ai.claudeHooks"]),
    );
    expect(onServer).not.toContain("general.theme");
    expect(onServer).not.toContain("terminal.fontSize");
    expect(onServer).not.toContain("shortcut.renameProject");
    expect(onServer).not.toContain("tts.openaiKey");
  });
});
