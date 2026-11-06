import { describe, expect, it } from "vitest";
import type { SlashCommand } from "./slashCommands";
import {
  effectiveCommands,
  findCommand,
  isValidCommandName,
  mergeSlashCommands,
  parseCommandRun,
  promptVariables,
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

  it("hides the agent's commands that lpm commands replace", () => {
    const rows = mergeSlashCommands(lists, [agent("commit"), agent("review")]);
    expect(rows.map((r) => `${r.source}:${r.name}`)).toEqual(["lpm:Ship", "lpm:commit", "builtin:review"]);
    expect(rows[1]).toMatchObject({ folder: "Git", scope: "global" });
  });

  it("carries each row's recent runs", () => {
    const withRuns: LpmCommandLists = {
      ...lists,
      project: {
        ...lists.project!,
        commands: lists.project!.commands.map((c) => ({ ...c, recentRuns: 4, lastRunAt: 9 })),
      },
      agentRuns: { review: { recentRuns: 2, lastRunAt: 7 } },
    };
    const rows = mergeSlashCommands(withRuns, [agent("Review"), agent("clear")]);
    expect(rows.find((r) => r.name === "Ship")).toMatchObject({ recentRuns: 4, lastRunAt: 9 });
    expect(rows.find((r) => r.name === "Review")).toMatchObject({ recentRuns: 2, lastRunAt: 7 });
    expect(rows.find((r) => r.name === "clear")?.recentRuns).toBeUndefined();
  });

  it("gives a filed skill made elsewhere its folder, from its own list", () => {
    const other = (name: string, folder: string) => ({
      name,
      description: "",
      preview: "",
      agents: [],
      path: "",
      folder,
    });
    const filed: LpmCommandLists = {
      ...lists,
      project: { ...lists.project!, others: [other("docs", "Web")] },
      global: { ...lists.global, others: [other("docs", "Global folder")] },
    };
    const row = (source: SlashCommand["source"]) =>
      mergeSlashCommands(filed, [{ ...agent("docs"), source }]).find((r) => r.name === "docs")?.folder;
    expect(row("project")).toBe("Web");
    expect(row("user")).toBe("Global folder");
    expect(row("builtin")).toBeUndefined();
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
    expect(isValidCommandName("fix-ticket-2")).toBe(true);
    expect(isValidCommandName("fix_ticket")).toBe(false);
    expect(isValidCommandName("Fix")).toBe(false);
    expect(isValidCommandName("two--dashes")).toBe(false);
    expect(isValidCommandName("x".repeat(65))).toBe(false);
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
