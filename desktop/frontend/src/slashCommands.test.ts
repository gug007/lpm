import { describe, expect, it } from "vitest";
import { mergeSlashCommands, type LpmCommand, type LpmCommandLists } from "./lpmCommands";
import { filterSlashCommands, type SlashCommand } from "./slashCommands";

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
  it("puts an agent command named after the fragment ahead of an lpm skill that only mentions it", () => {
    const all = menu(
      [skill("app-store-screenshots", "App Store", "Opens each screen in the iOS Simulator")],
      [agent("simplify", "Clean up changed code")],
    );
    expect(names(filterSlashCommands(all, "sim"))).toEqual(["simplify", "app-store-screenshots"]);
  });

  it("keeps lpm skills ahead of the agent's when both are named after the fragment", () => {
    const all = menu([skill("simulate", null)], [agent("simplify")]);
    expect(names(filterSlashCommands(all, "sim"))).toEqual(["simulate", "simplify"]);
  });

  it("keeps lpm skills ahead of the agent's when neither is named after the fragment", () => {
    const all = menu([skill("deploy", null, "Run the simulator")], [agent("review", "Find similar code")]);
    expect(names(filterSlashCommands(all, "sim"))).toEqual(["deploy", "review"]);
  });

  it("puts the row named after the fragment first inside its group", () => {
    const all = menu(
      [skill("review-changes", "Review", "Audit my uncommitted changes"), skill("audit", "Review")],
      [],
    );
    expect(names(filterSlashCommands(all, "aud"))).toEqual(["audit", "review-changes"]);
  });

  it("puts the folder with a prefix match first and keeps each folder together", () => {
    const all = menu(
      [
        skill("review-changes", "Review", "Gaps in my uncommitted changes"),
        skill("gaps", "Review"),
        skill("gap-finder", "Git"),
      ],
      [],
    );
    expect(names(filterSlashCommands(all, "gap"))).toEqual(["gaps", "review-changes", "gap-finder"]);
  });

  it("keeps an agent group together when a looser agent row follows its prefix match", () => {
    const all = menu(
      [skill("deploy", null, "Run the simulator")],
      [agent("simplify"), agent("review", "Find similar code")],
    );
    expect(names(filterSlashCommands(all, "sim"))).toEqual(["simplify", "review", "deploy"]);
  });

  it("matches an lpm skill on its folder's name", () => {
    const all = menu([skill("audit", "Review")], [agent("simplify", "Review the code")]);
    expect(names(filterSlashCommands(all, "rev"))).toEqual(["audit", "simplify"]);
  });

  it("returns the full list for a lone slash", () => {
    const all = menu([skill("audit", "Review")], [agent("simplify")]);
    expect(filterSlashCommands(all, "")).toBe(all);
  });
});
