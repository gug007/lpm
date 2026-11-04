import { describe, expect, it } from "vitest";
import { variableSpans, type LpmCommand } from "../../lpmCommands";
import { matchRanges, promptSnippet } from "./skillSearch";
import { copyName, nameSuggestion, nextFreeName } from "./skillNames";
import { runAge, runsLabel, sortSkills } from "./skillUsage";

const skill = (name: string, over: Partial<LpmCommand> = {}): LpmCommand => ({
  name,
  scope: "project",
  folder: null,
  description: "",
  body: "Do it.",
  argumentHint: "",
  ...over,
});

describe("search matches", () => {
  it("finds every place, ignoring case", () => {
    expect(matchRanges("App Store app-store", "store")).toEqual([
      [4, 9],
      [14, 19],
    ]);
    expect(matchRanges("anything", "  ")).toEqual([]);
  });

  it("quotes the prompt only when the row shows no match itself", () => {
    const lesson = skill("lesson", {
      description: "Make a narrated lesson video",
      body: "Record the app\n\non a pristine data directory, then restore it after the take is done and checked.",
    });
    const snip = promptSnippet(lesson, "store");
    expect(snip?.match).toBe("store");
    expect(`${snip?.before}${snip?.match}${snip?.after}`).toContain("then restore it after");
    expect(snip?.before.startsWith("…")).toBe(true);
    expect(promptSnippet(lesson, "lesson")).toBeNull();
    expect(promptSnippet(lesson, "narrated")).toBeNull();
    expect(promptSnippet(lesson, "absent")).toBeNull();
  });

  it("reads the prompt's first line as the row's when there's no description", () => {
    expect(promptSnippet(skill("x", { body: "Fix the store\nmore" }), "store")).toBeNull();
  });
});

describe("usage", () => {
  const now = Date.UTC(2026, 10, 4, 12);
  const minute = 60_000;
  const day = 24 * 60 * minute;

  it("says how long ago in the largest whole unit", () => {
    expect(runAge(now - 20_000, now)).toBe("now");
    expect(runAge(now - 40 * minute, now)).toBe("40m");
    expect(runAge(now - 125 * minute, now)).toBe("2h");
    expect(runAge(now - 41 * day, now)).toBe("41d");
    expect(runAge(now - 90 * day, now)).toBe("3mo");
    expect(runAge(now - 800 * day, now)).toBe("2y");
    expect(runAge(now + minute, now)).toBe("now");
  });

  it("labels only a skill that has run", () => {
    expect(runsLabel({ runs: 14, lastRunAt: now - 2 * 60 * minute }, now)).toBe("2h · 14×");
    expect(runsLabel({}, now)).toBeNull();
    expect(runsLabel({ runs: 0, lastRunAt: now }, now)).toBeNull();
  });

  it("sorts by recent or most runs, the rest by name after them", () => {
    const cs = [
      skill("b", { runs: 1, lastRunAt: 300 }),
      skill("a"),
      skill("c", { runs: 9, lastRunAt: 100 }),
      skill("d"),
    ];
    expect(sortSkills(cs, "name")).toBe(cs);
    expect(sortSkills(cs, "recent").map((c) => c.name)).toEqual(["b", "c", "a", "d"]);
    expect(sortSkills(cs, "most").map((c) => c.name)).toEqual(["c", "b", "a", "d"]);
  });
});

describe("names lpm offers", () => {
  it("turns a typed name into one the rule allows", () => {
    expect(nameSuggestion("Fix Ticket!")).toBe("fix-ticket");
    expect(nameSuggestion("--Ship__it--")).toBe("ship-it");
    expect(nameSuggestion("!!!")).toBeNull();
    expect(nameSuggestion("a".repeat(80))).toHaveLength(64);
  });

  it("finds a free name beside a taken one", () => {
    expect(nextFreeName("ship", new Set(["ship"]))).toBe("ship-2");
    expect(nextFreeName("ship", new Set(["ship", "ship-2", "ship-3"]))).toBe("ship-4");
    expect(copyName("ship", new Set(["ship"]))).toBe("ship-copy");
    expect(copyName("ship", new Set(["ship", "ship-copy"]))).toBe("ship-copy-2");
    expect(copyName("a".repeat(64), new Set())).toHaveLength(64);
  });
});

describe("variables in a prompt", () => {
  it("says where each sits and whether lpm fills it in", () => {
    expect(variableSpans("Fix {{ticket}} on {{ branch }}")).toEqual([
      { start: 4, end: 14, name: "ticket", auto: false },
      { start: 18, end: 30, name: "branch", auto: true },
    ]);
  });
});
