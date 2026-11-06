import { describe, expect, it } from "vitest";
import { mergeSlashCommands, type LpmCommand, type LpmCommandLists } from "./lpmCommands";
import {
  filterSlashCommands,
  sentCommandName,
  slashPlace,
  slashTag,
  type SlashCommand,
} from "./slashCommands";

const skill = (name: string, folder: string | null, description = ""): LpmCommand => ({
  name,
  scope: "project",
  folder,
  body: "Do it.",
  description,
  argumentHint: "",
});

const agent = (name: string, description = ""): SlashCommand => ({
  name,
  description,
  argumentHint: "",
  source: "builtin",
});

const menu = (skills: LpmCommand[], commands: SlashCommand[]) => {
  const folders = [...new Set(skills.flatMap((s) => (s.folder ? [s.folder] : [])))];
  const lists: LpmCommandLists = {
    project: { folders, commands: skills },
    global: { folders: [], commands: [] },
    projectError: null,
  };
  return mergeSlashCommands(lists, commands);
};

const names = (rows: SlashCommand[]) => rows.map((c) => c.name);

describe("filterSlashCommands", () => {
  const ran = (c: SlashCommand, recentRuns: number, lastRunAt = 1): SlashCommand => ({ ...c, recentRuns, lastRunAt });

  describe("a lone slash", () => {
    it("lists every row A–Z, whoever made it, when nothing has run", () => {
      const all = menu([skill("zebra", "Z"), skill("lesson", null)], [agent("clear"), agent("model")]);
      expect(names(filterSlashCommands(all, ""))).toEqual(["clear", "lesson", "model", "zebra"]);
      expect(filterSlashCommands(all, "").some((c) => c.mostUsed)).toBe(false);
    });

    it("leads with the commands run most, mixing skills and the agent's", () => {
      const rows = [
        ran(agent("effort"), 45),
        ran({ ...agent("lesson"), source: "lpm", scope: "project" }, 10),
        agent("add-dir"),
        ran(agent("simplify"), 33),
      ];
      const sorted = filterSlashCommands(rows, "");
      expect(names(sorted)).toEqual(["effort", "simplify", "lesson", "add-dir"]);
      expect(sorted.map((c) => c.mostUsed ?? false)).toEqual([true, true, true, false]);
    });

    it("shows five at most and files the rest A–Z", () => {
      const rows = ["a", "b", "c", "d", "e", "f"].map((n, i) => ran(agent(n), 10 - i));
      const sorted = filterSlashCommands([agent("zz"), ...rows], "");
      expect(names(sorted)).toEqual(["a", "b", "c", "d", "e", "f", "zz"]);
      expect(sorted.filter((c) => c.mostUsed).length).toBe(5);
    });

    it("breaks a tie by the latest run, then by name", () => {
      const rows = [ran(agent("older"), 2, 5), ran(agent("newer"), 2, 9), ran(agent("alpha"), 2, 5)];
      expect(names(filterSlashCommands(rows, ""))).toEqual(["newer", "alpha", "older"]);
    });

    it("leaves the rows it was given as they were", () => {
      const rows = [ran(agent("effort"), 3)];
      filterSlashCommands(rows, "");
      expect(rows[0].mostUsed).toBeUndefined();
    });
  });

  describe("a typed fragment", () => {
    it("puts an agent command named after the fragment ahead of an lpm skill that only mentions it", () => {
      const all = menu(
        [skill("app-store-screenshots", "App Store", "Opens each screen in the iOS Simulator")],
        [agent("simplify", "Clean up changed code")],
      );
      expect(names(filterSlashCommands(all, "sim"))).toEqual(["simplify", "app-store-screenshots"]);
    });

    it("ranks an exact name, then a prefix, a later word, a folder, the middle of a name, a description", () => {
      const all = menu(
        [skill("zz-review", null), skill("audit", "Review"), skill("preview", null), skill("deploy", null, "a review")],
        [agent("reviewer"), agent("review")],
      );
      expect(names(filterSlashCommands(all, "review"))).toEqual([
        "review",
        "reviewer",
        "zz-review",
        "audit",
        "preview",
        "deploy",
      ]);
    });

    it("favours the row run most among equal matches, over who made it", () => {
      const rows = [ran(agent("simplify"), 33), { ...skill("simulate", null), source: "lpm" as const }];
      expect(names(filterSlashCommands(rows, "sim"))).toEqual(["simplify", "simulate"]);
    });

    it("drops the Most used marks and every row that doesn't match", () => {
      const sorted = filterSlashCommands([ran(agent("effort"), 3), agent("clear")], "eff");
      expect(names(sorted)).toEqual(["effort"]);
      expect(sorted[0].mostUsed).toBeUndefined();
    });
  });
});

describe("slashTag and slashPlace", () => {
  const lpm = (folder: string | null, scope: "global" | "project"): SlashCommand => ({
    ...agent("x"),
    source: "lpm",
    folder,
    scope,
  });

  it("names a skill's folder, else its list", () => {
    expect(slashTag(lpm("Lessons", "project"))).toBe("Lessons");
    expect(slashTag(lpm(null, "project"))).toBe("This project");
    expect(slashTag(lpm(null, "global"))).toBe("Global");
  });

  it("names only the last level of a nested folder on the row", () => {
    expect(slashTag(lpm("Work/Reviews", "project"))).toBe("Reviews");
    expect(slashPlace(lpm("Work/Reviews", "project"), "Claude Code")).toBe("Work/Reviews · This project");
  });

  it("treats a skill made elsewhere like the list it's in", () => {
    expect(slashTag({ ...agent("x"), source: "project" })).toBe("This project");
    expect(slashTag({ ...agent("x"), source: "user" })).toBe("Global");
    expect(slashTag({ ...agent("x"), source: "user", folder: "Docs" })).toBe("Docs");
  });

  it("leaves the agent's own untagged and names the agent in full", () => {
    expect(slashTag(agent("clear"))).toBeNull();
    expect(slashPlace(agent("clear"), "Claude Code")).toBe("Claude Code");
  });
});

describe("sentCommandName", () => {
  it("reads the command a message opens with", () => {
    expect(sentCommandName("/compact")).toBe("compact");
    expect(sentCommandName("  /effort high\n")).toBe("effort");
    expect(sentCommandName("/prompts:draft now")).toBe("prompts:draft");
  });

  it("ignores a slash anywhere else, and a path", () => {
    expect(sentCommandName("please /compact")).toBeNull();
    expect(sentCommandName("/usr/bin/env")).toBeNull();
    expect(sentCommandName("hello")).toBeNull();
  });
});
