import { describe, expect, it } from "vitest";
import { commandKey, type LpmCommand, type LpmCommandLists } from "../../lpmCommands";
import {
  ALL_FOLDERS,
  draftOf,
  draftProblem,
  folderCounts,
  folderKey,
  folderTitle,
  isDirty,
  movedTo,
  newDraft,
  parseFolderKey,
  runningKeys,
  visibleCommands,
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
    expect(parseFolderKey(ALL_FOLDERS)).toBeNull();
  });

  it("titles a folder with its list", () => {
    expect(folderTitle(folderKey("project", "Bugs"), "web")).toBe("Bugs · web");
    expect(folderTitle(folderKey("global", null), "web")).toBe("No folder · global");
  });
});

describe("listing", () => {
  it("counts and filters per folder, project commands first", () => {
    const counts = folderCounts(lists);
    expect(counts.get(ALL_FOLDERS)).toBe(4);
    expect(counts.get(folderKey("global", null))).toBe(1);
    expect(counts.get(folderKey("global", "Writing"))).toBeUndefined();
    expect(visibleCommands(lists, ALL_FOLDERS, "").map((c) => c.name)).toEqual([
      "fix-ticket",
      "ship",
      "commit",
      "ship",
    ]);
    expect(visibleCommands(lists, ALL_FOLDERS, "git").map((c) => c.name)).toEqual(["commit"]);
  });

  it("knows which of two same-named commands runs", () => {
    const running = runningKeys(lists);
    expect(running.has(commandKey(lists.project!.commands[1]))).toBe(true);
    expect(running.has(commandKey(lists.global.commands[1]))).toBe(false);
  });
});

describe("drafts", () => {
  it("start in the folder being looked at", () => {
    expect(newDraft(folderKey("global", "Git"), lists)).toMatchObject({ scope: "global", folder: "Git" });
    expect(newDraft(ALL_FOLDERS, lists, "Body")).toMatchObject({ scope: "project", folder: null, body: "Body" });
  });

  it("are dirty only once changed", () => {
    const d = draftOf(lists.global.commands[0]);
    expect(isDirty(d, lists)).toBe(false);
    expect(isDirty({ ...d, body: "Else" }, lists)).toBe(true);
    expect(isDirty(newDraft(ALL_FOLDERS, lists), lists)).toBe(false);
  });

  it("explain what stops a save", () => {
    const d = newDraft(folderKey("global", null), lists, "Body");
    expect(draftProblem(d, lists)).toBe("Give it a name.");
    expect(draftProblem({ ...d, name: "two words" }, lists)).toMatch(/Letters/);
    expect(draftProblem({ ...d, name: "Commit" }, lists)).toBe("/commit already exists in the Git folder.");
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
