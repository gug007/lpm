import { describe, expect, it } from "vitest";
import {
  buildSearchEntries,
  matchSettings,
  type SettingsSearchEntry,
} from "./settings-registry";

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

  it("indexes dynamic shortcut and sound rows from their source arrays", () => {
    expect(ids(withTTS)).toEqual(
      expect.arrayContaining(["shortcut.tabSwitchNext", "sound.done"]),
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

  it("excludes filtered-out entries from results", () => {
    expect(ids(matchSettings(withoutTTS, "kokoro"))).not.toContain("tts.enable");
    expect(ids(matchSettings(withTTS, "kokoro"))).toContain("tts.enable");
  });
});
