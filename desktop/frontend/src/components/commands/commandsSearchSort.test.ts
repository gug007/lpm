import { describe, expect, it } from "vitest";
import type { LpmCommand, LpmCommandLists } from "../../lpmCommands";
import { commandTree, draftIssue, draftOf, draftProblem } from "./commandsModel";

const cmd = (name: string, scope: "global" | "project", folder: string | null, body = "Do it."): LpmCommand => ({
  name,
  scope,
  folder,
  body,
  description: "",
  argumentHint: "",
});

const lists: LpmCommandLists = {
  project: { folders: ["Bugs"], commands: [cmd("fix-ticket", "project", "Bugs"), cmd("ship", "project", null)] },
  global: { folders: ["Git"], commands: [cmd("commit", "global", "Git"), cmd("ship", "global", null)] },
  projectError: null,
};

describe("sorting and counting the tree", () => {
  it("orders each folder's skills as asked and counts the other skills too", () => {
    const ran = (c: LpmCommand, runs: number, lastRunAt: number) => ({ ...c, runs, lastRunAt });
    const sorted = commandTree(
      {
        ...lists,
        project: {
          folders: [],
          commands: [cmd("alpha", "project", null), ran(cmd("beta", "project", null), 3, 50), ran(cmd("gamma", "project", null), 9, 10)],
          others: [{ name: "lint", description: "", preview: "", agents: [], path: "", folder: null }],
        },
      },
      "",
      "recent",
    );
    expect(sorted[0].loose.map((c) => c.name)).toEqual(["beta", "gamma", "alpha"]);
    expect(sorted[0].count).toBe(3);
    expect(sorted[0].matched).toBe(4);
  });
});

describe("what's wrong with a draft", () => {
  it("names the field and offers a name", () => {
    const d = draftOf(cmd("ship", "project", null));
    expect(draftIssue({ ...d, name: "" }, lists)).toEqual({ field: "name", message: "Give it a name." });
    expect(draftIssue({ ...d, name: "Fix-Ticket" }, lists)).toMatchObject({ field: "name", fix: "fix-ticket-2" });
    expect(draftIssue({ ...d, body: " " }, lists)).toEqual({ field: "body", message: "Write the prompt." });
    expect(draftIssue({ ...d, original: null }, lists)).toMatchObject({ field: "name", fix: "ship-2" });
    expect(draftProblem({ ...d, original: null }, lists)).toBe("/ship already exists in No folder.");
  });
});

describe("searching", () => {
  it("finds a skill typed the way it runs, with its slash", () => {
    const found = commandTree(lists, " /FIX ");
    expect(found.map((s) => s.scope)).toEqual(["project"]);
    expect(found[0].folders[0].commands.map((c) => c.name)).toEqual(["fix-ticket"]);
  });
});
