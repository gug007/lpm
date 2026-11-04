import { describe, expect, it } from "vitest";
import type { SlashCommand } from "./slashCommands";
import {
  effectiveCommands,
  findCommand,
  isValidCommandName,
  mergeSlashCommands,
  parseCommandRun,
  promptVariables,
  rankLpmGroups,
  shadowNote,
  type LpmCommand,
  type LpmCommandLists,
} from "./lpmCommands";

const cmd = (name: string, scope: "global" | "project", folder: string | null = null): LpmCommand => ({
  name,
  scope,
  folder,
  body: "Do it.",
  description: `${scope} ${name}`,
  argumentHint: "",
});

const lists: LpmCommandLists = {
  project: { folders: [], commands: [cmd("Ship", "project")] },
  global: { folders: ["Git"], commands: [cmd("commit", "global", "Git"), cmd("ship", "global")] },
  projectError: null,
};

const agent = (name: string): SlashCommand => ({ name, description: "", argumentHint: "", source: "builtin" });

describe("which command /name runs", () => {
  it("prefers the project's own, whatever the case", () => {
    expect(effectiveCommands(lists).map((c) => `${c.scope}:${c.name}`)).toEqual(["project:Ship", "global:commit"]);
    expect(findCommand(lists, "SHIP")?.scope).toBe("project");
    expect(findCommand(lists, "nope")).toBeNull();
  });

  it("puts lpm commands ahead of the agent's and hides the ones they replace", () => {
    const rows = mergeSlashCommands(lists, [agent("commit"), agent("review")]);
    expect(rows.map((r) => `${r.source}:${r.name}`)).toEqual(["lpm:Ship", "lpm:commit", "builtin:review"]);
    expect(rows[1]).toMatchObject({ folder: "Git", scope: "global" });
  });
});

describe("parseCommandRun", () => {
  it("reads a whole message that is a command", () => {
    expect(parseCommandRun("/fix-ticket LPM-1 now")).toEqual({ name: "fix-ticket", args: "LPM-1 now" });
    expect(parseCommandRun("  /ship\n")).toEqual({ name: "ship", args: "" });
    expect(parseCommandRun("/fix\nmore lines")).toEqual({ name: "fix", args: "more lines" });
  });

  it("ignores text that only mentions one", () => {
    expect(parseCommandRun("please /ship")).toBeNull();
    expect(parseCommandRun("/usr/bin/env")).toBeNull();
  });
});

describe("names", () => {
  it("validates", () => {
    expect(isValidCommandName("fix_ticket-2")).toBe(true);
    expect(isValidCommandName("-x")).toBe(false);
    expect(isValidCommandName("two words")).toBe(false);
  });
});

describe("promptVariables", () => {
  it("splits what a run asks for from what lpm fills in", () => {
    expect(promptVariables("Fix {{ticket}} on {{branch}} for {{ who }} and {{ticket}}")).toEqual({
      asks: ["ticket", "who"],
      auto: ["branch"],
    });
  });

  it("fills in the command's folder rather than asking for it", () => {
    expect(promptVariables("Read {{dir}}/GUIDE.md about {{what}}")).toEqual({ asks: ["what"], auto: ["dir"] });
  });
});

describe("shadowNote", () => {
  it("names what a name hides or is hidden by", () => {
    expect(shadowNote(lists.global.commands[1], lists)).toBe("This project's own /ship runs instead here.");
    expect(shadowNote(lists.project!.commands[0], lists)).toBe("Replaces your global /Ship in this project.");
    expect(shadowNote(lists.global.commands[0], lists)).toBeNull();
  });
});

describe("rankLpmGroups", () => {
  const row = (name: string, folder: string | null, description = ""): SlashCommand => ({
    name,
    folder,
    description,
    argumentHint: "",
    source: "lpm",
    scope: "project",
  });

  it("puts the folder with a prefix match first and keeps each folder together", () => {
    const review = row("review-changes", "Review", "Gaps in my uncommitted changes");
    const audit = row("audit", "Review");
    const commit = row("commit-parts", "Git");
    const all = [review, audit, commit];
    expect(rankLpmGroups(all, new Set([commit, audit]), new Set([review])).map((c) => c.name)).toEqual([
      "review-changes",
      "audit",
      "commit-parts",
    ]);
    expect(rankLpmGroups(all, new Set([commit]), new Set([review])).map((c) => c.name)).toEqual([
      "commit-parts",
      "review-changes",
    ]);
  });
});
