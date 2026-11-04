import { describe, expect, it } from "vitest";
import { commandKey, type LpmCommand, type LpmCommandLists } from "../../lpmCommands";
import {
  commandTree,
  draftOf,
  draftProblem,
  folderKey,
  folderNamed,
  isDirty,
  movedTo,
  newDraft,
  parseFolderKey,
  placeChoices,
  runningKeys,
} from "./commandsModel";

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

describe("folder keys", () => {
  it("round-trip a folder and No folder", () => {
    expect(parseFolderKey(folderKey("project", "Bugs"))).toEqual({ scope: "project", folder: "Bugs" });
    expect(parseFolderKey(folderKey("global", null))).toEqual({ scope: "global", folder: null });
    expect(parseFolderKey("all")).toBeNull();
  });
});

describe("listing", () => {
  const names = (cs: LpmCommand[]) => cs.map((c) => c.name);

  it("builds a tree of both lists, project first, loose commands after the folders", () => {
    const tree = commandTree({ ...lists, global: { ...lists.global, folders: ["Git", "Empty"] } }, "");
    expect(tree.map((s) => s.scope)).toEqual(["project", "global"]);
    expect(tree[0].folders.map((f) => [f.name, names(f.commands)])).toEqual([["Bugs", ["fix-ticket"]]]);
    expect(names(tree[0].loose)).toEqual(["ship"]);
    expect(tree[1].folders.map((f) => f.name)).toEqual(["Git", "Empty"]);
    expect(tree[1].count).toBe(2);
  });

  it("leaves out the project list outside a project", () => {
    expect(commandTree({ ...lists, project: null }, "").map((s) => s.scope)).toEqual(["global"]);
  });

  it("keeps only what a search matches", () => {
    const tree = commandTree(lists, " GIT ");
    expect(tree.map((s) => s.scope)).toEqual(["global"]);
    expect(tree[0].folders.map((f) => [f.name, names(f.commands)])).toEqual([["Git", ["commit"]]]);
    expect(tree[0].loose).toEqual([]);
    expect(tree[0].count).toBe(1);
    expect(commandTree(lists, "nothing like it")).toEqual([]);
  });

  it("knows which of two same-named commands runs", () => {
    const running = runningKeys(lists);
    expect(running.has(commandKey(lists.project!.commands[1]))).toBe(true);
    expect(running.has(commandKey(lists.global.commands[1]))).toBe(false);
  });
});

describe("drafts", () => {
  it("start in the folder being looked at", () => {
    expect(newDraft({ scope: "global", folder: "Git" }, lists)).toMatchObject({ scope: "global", folder: "Git" });
    expect(newDraft(null, lists, "Body")).toMatchObject({ scope: "project", folder: null, body: "Body" });
    expect(newDraft(null, { ...lists, project: null })).toMatchObject({ scope: "global", folder: null });
  });

  it("are dirty only once changed", () => {
    const d = draftOf(lists.global.commands[0]);
    expect(isDirty(d, lists)).toBe(false);
    expect(isDirty({ ...d, body: "Else" }, lists)).toBe(true);
    expect(isDirty(newDraft(null, lists), lists)).toBe(false);
  });

  it("explain what stops a save", () => {
    const d = newDraft({ scope: "global", folder: null }, lists, "Body");
    expect(draftProblem(d, lists)).toBe("Give it a name.");
    expect(draftProblem({ ...d, name: "two words" }, lists)).toMatch(/Lowercase/);
    expect(draftProblem({ ...d, name: "commit" }, lists)).toBe("/commit already exists in the Git folder.");
    expect(draftProblem({ ...d, name: "new-one" }, lists)).toBeNull();
    expect(draftProblem(draftOf(lists.global.commands[0]), lists)).toBeNull();
  });
});

describe("dropping on a folder", () => {
  it("moves within and across lists", () => {
    expect(movedTo(lists.global.commands[0], folderKey("global", null), lists)).toMatchObject({
      scope: "global",
      folder: null,
    });
    expect(movedTo(lists.global.commands[0], folderKey("project", "Bugs"), lists)).toMatchObject({
      scope: "project",
      folder: "Bugs",
    });
  });

  it("refuses a no-op or a name the other list has", () => {
    expect(movedTo(lists.global.commands[0], folderKey("global", "Git"), lists)).toBeNull();
    expect(movedTo(lists.global.commands[1], folderKey("project", "Bugs"), lists)).toBeNull();
  });
});

describe("placeChoices", () => {
  it("offers each list's no folder and folders, this project first", () => {
    expect(placeChoices({ scope: "project", folder: null }, lists)).toEqual([
      { scope: "project", folders: [null, "Bugs"] },
      { scope: "global", folders: [null, "Git"] },
    ]);
  });

  it("keeps a folder that isn't saved yet in its own list only", () => {
    const [project, global] = placeChoices({ scope: "project", folder: "Docs" }, lists);
    expect(project.folders).toEqual([null, "Bugs", "Docs"]);
    expect(global.folders).toEqual([null, "Git"]);
  });

  it("offers only the global list outside a project", () => {
    const choices = placeChoices({ scope: "global", folder: null }, { ...lists, project: null });
    expect(choices.map((c) => c.scope)).toEqual(["global"]);
  });
});

describe("folderNamed", () => {
  it("uses the list's spelling, or the name as typed for a new folder", () => {
    expect(folderNamed("bugs", "project", lists)).toBe("Bugs");
    expect(folderNamed("Docs", "project", lists)).toBe("Docs");
    expect(folderNamed("bugs", "global", lists)).toBe("bugs");
  });
});
