import { describe, expect, it } from "vitest";
import { buildSearchEntries, matchSettings } from "./settings-registry";
import { groupSearchResults, highlightParts, pageOf, searchHints } from "./settingsSearchHits";
import type { PeerMachine } from "./settingsMachine";

const entries = buildSearchEntries({ experimentalTTS: true, mac: true });

function grouped(query: string) {
  return groupSearchResults(matchSettings(entries, query), query);
}

describe("groupSearchResults", () => {
  it("puts twins under the page each lives on", () => {
    const groups = grouped("caffeinate");
    const pages = groups.map((g) => g.page);
    expect(pages).toEqual(expect.arrayContaining(["Mobile devices", "Connections"]));
    for (const group of groups) {
      expect(group.hits.every((h) => pageOf(h.entry) === group.page)).toBe(true);
    }
  });

  it("orders pages by their best-ranked result and keeps every result once", () => {
    const results = matchSettings(entries, "theme");
    const groups = groupSearchResults(results, "theme");
    expect(groups[0].hits[0].entry.label).toBe("Theme");
    const flat = groups.flatMap((g) => g.hits.map((h) => h.entry.id));
    expect([...flat].sort()).toEqual(results.map((r) => r.id).sort());
  });

  it("says which keywords matched when nothing shown did", () => {
    const hit = grouped("caffeinate").flatMap((g) => g.hits).find((h) => h.entry.id === "mobile.keepAwake");
    expect(hit?.keywords).toEqual(["caffeinate"]);
  });

  it("names no keywords when the label, description or page matched", () => {
    const hits = grouped("theme").flatMap((g) => g.hits);
    expect(hits.find((h) => h.entry.id === "general.theme")?.keywords).toEqual([]);
    const general = grouped("general").flatMap((g) => g.hits);
    expect(general.find((h) => h.entry.id === "general.theme")?.keywords).toEqual([]);
  });

  it("names the page a result lives on", () => {
    expect(pageOf(entries.find((e) => e.id === "global-config")!)).toBe("Global config");
    expect(pageOf(entries.find((e) => e.id === "usage")!)).toBe("Accounts & usage");
    expect(pageOf(entries.find((e) => e.id === "general.autoPull")!)).toBe("Git");
  });
});

describe("highlightParts", () => {
  it("marks every case-insensitive occurrence", () => {
    expect(highlightParts("Port and passport", "PORT")).toEqual([
      { text: "Port", match: true },
      { text: " and pass", match: false },
      { text: "port", match: true },
    ]);
  });

  it("leaves text without the query whole", () => {
    expect(highlightParts("Theme", "font")).toEqual([{ text: "Theme", match: false }]);
    expect(highlightParts("Theme", "  ")).toEqual([{ text: "Theme", match: false }]);
  });

  it("matches the trimmed query", () => {
    expect(highlightParts("Font size", " size ")).toEqual([
      { text: "Font ", match: false },
      { text: "size", match: true },
    ]);
  });
});

describe("searchHints", () => {
  it("suggests searches that find something", () => {
    const hints = searchHints(entries);
    expect(hints.length).toBeGreaterThanOrEqual(2);
    expect(hints.length).toBeLessThanOrEqual(3);
    for (const hint of hints) expect(matchSettings(entries, hint).length).toBeGreaterThan(0);
  });

  it("skips searches the machine shown has nothing for", () => {
    const server: PeerMachine = {
      kind: "peer",
      slug: "aabbccdd",
      name: "build-box",
      attended: false,
      mac: false,
      version: "0.7.20",
    };
    const onServer = buildSearchEntries({ experimentalTTS: true, mac: true, machine: server });
    for (const hint of searchHints(onServer)) expect(matchSettings(onServer, hint).length).toBeGreaterThan(0);
    expect(searchHints(onServer)).not.toContain("font");
  });
});
