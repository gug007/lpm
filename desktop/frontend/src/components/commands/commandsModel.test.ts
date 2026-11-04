import { describe, expect, it } from "vitest";
import { commandKey, type LpmCommand, type LpmCommandLists } from "../../lpmCommands";
import {
  agentReach,
  canKeepOutOfGit,
  commandPath,
  commandTree,
  draftAfterFolderMove,
  draftFile,
  draftOf,
  draftProblem,
  findOther,
  isDirty,
  keptOutNote,
  movedTo,
  newDraft,
  otherDrop,
  otherKey,
  placeChoices,
  runningKeys,
} from "./commandsModel";
import { folderKey, folderNamed, parseFolderKey } from "./commandFolders";

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

describe("other skills", () => {
  const skill = (name: string, description = "", folder: string | null = null) => ({
    name,
    description,
    preview: "",
    agents: ["claude"],
    path: "",
    folder,
  });
  const withOthers: LpmCommandLists = {
    ...lists,
    project: { ...lists.project!, others: [skill("android-cli", "Android tools")] },
    global: { ...lists.global, others: [skill("find-docs")] },
  };

  it("keeps them with their list, out of its count", () => {
    const [project, global] = commandTree(withOthers, "");
    expect(project.others.map((o) => o.name)).toEqual(["android-cli"]);
    expect(project.count).toBe(project.loose.length + project.folders.flatMap((f) => f.commands).length);
    expect(global.others.map((o) => o.name)).toEqual(["find-docs"]);
  });

  it("finds them by name or description, and keeps a list that only they match", () => {
    expect(commandTree(withOthers, "android tools").map((t) => t.scope)).toEqual(["project"]);
    expect(commandTree(withOthers, "find-").map((t) => t.scope)).toEqual(["global"]);
  });

  it("treats a list from an older lpm as having none", () => {
    expect(commandTree(lists, "").every((t) => t.others.length === 0)).toBe(true);
    expect(findOther(lists, { scope: "global", name: "x" })).toBeNull();
  });

  it("finds one by its list, whose name can repeat in the other", () => {
    expect(findOther(withOthers, { scope: "project", name: "android-cli" })?.description).toBe("Android tools");
    expect(findOther(withOthers, { scope: "global", name: "android-cli" })).toBeNull();
    expect(otherKey("project", "x")).not.toBe(otherKey("global", "x"));
  });

  it("shows one filed in a folder under that folder, not in the group", () => {
    const filed: LpmCommandLists = {
      ...lists,
      project: { ...lists.project!, others: [skill("deploy", "", "Bugs"), skill("lint")] },
    };
    const [project] = commandTree(filed, "");
    expect(project.folders.find((f) => f.name === "Bugs")?.others.map((o) => o.name)).toEqual(["deploy"]);
    expect(project.others.map((o) => o.name)).toEqual(["lint"]);
    expect(commandTree(filed, "deploy")[0].folders.map((f) => f.name)).toEqual(["Bugs"]);
  });

  it("files one by folder name in its own list, wherever it was dropped", () => {
    const o = skill("lint", "", "Bugs");
    const folder = (f: string) => ({ folder: f, root: false });
    expect(otherDrop(o, "project", folderKey("project", "Docs"), false)).toEqual(folder("Docs"));
    expect(otherDrop(o, "project", folderKey("project", "Bugs"), false)).toBeUndefined();
    expect(otherDrop(o, "project", folderKey("global", "Git"), false)).toEqual(folder("Git"));
    expect(otherDrop(o, "project", folderKey("global", null), false)).toBeUndefined();
  });

  it("tells the top of a list from the Other skills group", () => {
    const inGroup = skill("lint", "");
    const atRoot = { ...inGroup, atRoot: true };
    const rootKey = folderKey("project", null);
    const top = { folder: null, root: true };
    const group = { folder: null, root: false };
    expect(otherDrop(inGroup, "project", rootKey, false)).toEqual(top);
    expect(otherDrop(inGroup, "project", rootKey, true)).toBeUndefined();
    expect(otherDrop(atRoot, "project", rootKey, true)).toEqual(group);
    expect(otherDrop(atRoot, "project", rootKey, false)).toBeUndefined();
    expect(otherDrop(skill("lint", "", "Bugs"), "project", rootKey, false)).toEqual(top);
    expect(otherDrop(skill("lint", "", "Bugs"), "project", rootKey, true)).toEqual(group);
  });

  it("keeps a skill at the top out of the Other skills group", () => {
    const lists: LpmCommandLists = {
      project: { folders: [], commands: [], others: [skill("lint", ""), { ...skill("docs", ""), atRoot: true }] },
      global: { folders: [], commands: [] },
      projectError: null,
    };
    const [project] = commandTree(lists, "");
    expect(project.others.map((o) => o.name)).toEqual(["lint"]);
    expect(project.rootOthers.map((o) => o.name)).toEqual(["docs"]);
  });

  it("says which agents read it", () => {
    const reach = agentReach(["claude", "opencode"]);
    expect(reach.filter((a) => a.reads).map((a) => a.label)).toEqual(["Claude Code", "OpenCode"]);
    expect(reach.filter((a) => !a.reads).map((a) => a.label)).toContain("Codex");
  });
});

describe("keeping a skill out of Git", () => {
  const skill = (over: Partial<LpmCommand>): LpmCommand => ({ ...cmd("mine", "project", null), ...over });
  const inRepo = (c: LpmCommand, inRepoList = true): LpmCommandLists => ({
    project: { folders: [], commands: [c], inRepo: inRepoList },
    global: { folders: [], commands: [] },
    projectError: null,
  });

  it("is offered for a project's skill in a repo, and not elsewhere", () => {
    const lists = inRepo(skill({}));
    expect(canKeepOutOfGit({ scope: "project", folder: null }, lists)).toBe(true);
    expect(canKeepOutOfGit({ scope: "global", folder: null }, lists)).toBe(false);
    expect(canKeepOutOfGit({ scope: "project", folder: null }, inRepo(skill({}), false))).toBe(false);
  });

  it("isn't offered by a computer on an older lpm", () => {
    const older: LpmCommandLists = { project: { folders: [], commands: [] }, global: { folders: [], commands: [] }, projectError: null };
    expect(canKeepOutOfGit({ scope: "project", folder: null }, older)).toBe(false);
  });

  it("starts from what the saved skill says, off for a new one", () => {
    expect(draftOf(skill({ keptOutOfGit: true })).keepOutOfGit).toBe(true);
    expect(draftOf(skill({})).keepOutOfGit).toBe(false);
    expect(newDraft(null, inRepo(skill({}))).keepOutOfGit).toBe(false);
  });

  it("counts as a change to save", () => {
    const saved = skill({});
    expect(isDirty({ ...draftOf(saved), keepOutOfGit: true }, inRepo(saved))).toBe(true);
    expect(isDirty(draftOf(saved), inRepo(saved))).toBe(false);
  });

  it("isn't a change where the switch isn't shown", () => {
    const saved = skill({});
    expect(isDirty({ ...draftOf(saved), keepOutOfGit: true }, inRepo(saved, false))).toBe(false);
  });

  it("warns only for a committed skill being turned on", () => {
    const committed = skill({ tracked: true });
    const on = { ...draftOf(committed), keepOutOfGit: true };
    expect(keptOutNote(on, inRepo(committed))).toMatch(/Already committed/);
    expect(keptOutNote(draftOf(committed), inRepo(committed))).toBeNull();
    const fresh = skill({});
    expect(keptOutNote({ ...draftOf(fresh), keepOutOfGit: true }, inRepo(fresh))).toBeNull();
    expect(keptOutNote({ ...newDraft(null, inRepo(fresh)), keepOutOfGit: true }, inRepo(fresh))).toBeNull();
  });
});

describe("folders inside folders", () => {
  const nested: LpmCommandLists = {
    global: {
      folders: ["Home", "Work", "Work/Reviews", "Work/Reviews/Deep", "Workshop"],
      commands: [
        cmd("top", "global", "Work"),
        cmd("mid", "global", "Work/Reviews"),
        cmd("low", "global", "Work/Reviews/Deep"),
        cmd("shop", "global", "Workshop"),
      ],
      others: [{ name: "lint", description: "", preview: "", agents: [], path: "", folder: "Work/Reviews" }],
    },
    project: null,
    projectError: null,
  };

  it("puts each folder under its parent and counts all that's inside", () => {
    const [scope] = commandTree(nested, "");
    expect(scope.folders.map((f) => f.name)).toEqual(["Home", "Work", "Workshop"]);
    const work = scope.folders[1];
    expect(work.label).toBe("Work");
    expect(work.total).toBe(4);
    const reviews = work.children[0];
    expect(reviews).toMatchObject({ name: "Work/Reviews", label: "Reviews", depth: 1, total: 3 });
    expect(reviews.others.map((o) => o.name)).toEqual(["lint"]);
    expect(reviews.children[0]).toMatchObject({ name: "Work/Reviews/Deep", label: "Deep", depth: 2, total: 1 });
  });

  it("shows a folder a list somehow left a parent out of under that parent", () => {
    const [scope] = commandTree(
      { global: { folders: ["A/B"], commands: [] }, project: null, projectError: null },
      "",
    );
    expect(scope.folders.map((f) => f.name)).toEqual(["A"]);
    expect(scope.folders[0].children.map((f) => f.name)).toEqual(["A/B"]);
  });

  it("keeps the way down to a match when searching and drops the rest", () => {
    const [scope] = commandTree(nested, "low");
    expect(scope.folders.map((f) => f.name)).toEqual(["Work"]);
    expect(scope.folders[0].commands).toEqual([]);
    expect(scope.folders[0].children[0].children[0].commands.map((c) => c.name)).toEqual(["low"]);
  });

  it("lists a pending folder and its new parents where the tree would show them", () => {
    const [scope] = placeChoices({ scope: "global", folder: "Home/New/Inner" }, nested);
    expect(scope.folders).toEqual([
      null,
      "Home",
      "Home/New",
      "Home/New/Inner",
      "Work",
      "Work/Reviews",
      "Work/Reviews/Deep",
      "Workshop",
    ]);
  });

  it("brings the editor along when its folder or one around it moves", () => {
    const draft = draftOf(nested.global.commands[1]);
    const moved = draftAfterFolderMove(draft, "global", "Work", "Job");
    expect(moved.folder).toBe("Job/Reviews");
    expect(moved.original?.folder).toBe("Job/Reviews");
    const up = draftAfterFolderMove(draft, "global", "Work/Reviews", "Work");
    expect(up.folder).toBe("Work");
    expect(draftAfterFolderMove(draft, "project", "Work", "Job")).toEqual(draft);
  });

  it("leaves a folder's next-door neighbour out of its moves", () => {
    const draft = draftOf(nested.global.commands[3]);
    expect(draftAfterFolderMove(draft, "global", "Work", "Job").folder).toBe("Workshop");
  });

  it("moves a skill into a folder inside another", () => {
    const moved = movedTo(nested.global.commands[3], folderKey("global", "Work/Reviews/Deep"), nested);
    expect(moved?.folder).toBe("Work/Reviews/Deep");
  });
});

describe("where a skill's file is", () => {
  const at = (path: string, scope: "global" | "project" = "project") => ({ ...cmd("lesson", scope, null), path });

  it("names the skills folder it's really in", () => {
    const own = at("/Users/me/lpm/.claude/skills/lesson/SKILL.md");
    expect(commandPath(own, own)).toBe(".claude/skills/lesson/SKILL.md");
    const mine = at("/Users/me/.agents/skills/lesson/SKILL.md", "global");
    expect(commandPath(mine, mine)).toBe("~/.agents/skills/lesson/SKILL.md");
    const windows = at("C:\\Users\\me\\.codex\\skills\\lesson\\SKILL.md", "global");
    expect(commandPath(windows, windows)).toBe("~/.codex/skills/lesson/SKILL.md");
  });

  it("follows a rename in the same folder, and a new or moved skill to .agents/skills", () => {
    const own = at("/Users/me/lpm/.claude/skills/lesson/SKILL.md");
    expect(commandPath({ ...own, name: "lessons" }, own)).toBe(".claude/skills/lessons/SKILL.md");
    expect(commandPath({ ...own, scope: "global" }, own)).toBe("~/.agents/skills/lesson/SKILL.md");
    expect(commandPath(cmd("", "project", null), null)).toBe(".agents/skills/name/SKILL.md");
    expect(commandPath(cmd("old", "project", null), cmd("old", "project", null))).toBe(".agents/skills/old/SKILL.md");
  });

  it("has a file on disk only while the draft still names the saved one", () => {
    const own = at("/Users/me/lpm/.claude/skills/lesson/SKILL.md");
    expect(draftFile(own, own)).toBe(own.path);
    expect(draftFile({ ...own, name: "lessons" }, own)).toBeNull();
    expect(draftFile({ ...own, scope: "global" }, own)).toBeNull();
    expect(draftFile(own, null)).toBeNull();
    expect(draftFile(own, cmd("lesson", "project", null))).toBeNull();
  });
});
