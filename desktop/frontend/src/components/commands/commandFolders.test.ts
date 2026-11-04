import { describe, expect, it } from "vitest";
import type { CommandScopeList, LpmCommandLists } from "../../lpmCommands";
import {
  childFolder,
  folderAfterMove,
  folderDepth,
  folderDrop,
  folderIndent,
  folderKey,
  folderLabel,
  folderNamed,
  folderParent,
  heldCount,
  innermostTarget,
  inTreeOrder,
  isInside,
  skillIndent,
  withParents,
} from "./commandFolders";

const list = (folders: string[]): CommandScopeList => ({ folders, commands: [] });

describe("folder paths", () => {
  it("splits a path into its parent and its own name", () => {
    expect(folderParent("Work/Reviews/Deep")).toBe("Work/Reviews");
    expect(folderParent("Work")).toBeNull();
    expect(folderLabel("Work/Reviews/Deep")).toBe("Deep");
    expect(folderLabel("Work")).toBe("Work");
    expect(folderDepth("Work")).toBe(0);
    expect(folderDepth("Work/Reviews/Deep")).toBe(2);
    expect(childFolder("Work", "Reviews")).toBe("Work/Reviews");
    expect(childFolder(null, "Work")).toBe("Work");
  });

  it("doesn't take a neighbour with the same start for a folder inside", () => {
    expect(isInside("Work/Reviews", "Work")).toBe(true);
    expect(isInside("Workshop", "Work")).toBe(false);
    expect(isInside("Work", "Work")).toBe(false);
    expect(isInside(null, "Work")).toBe(false);
  });

  it("adds missing parents, ahead of what they hold, without repeats", () => {
    expect(withParents(["A/B/C", "A", "D"])).toEqual(["A", "A/B", "A/B/C", "D"]);
  });

  it("orders folders with what's inside each right after it", () => {
    expect(inTreeOrder(["A", "B", "A/Z", "A/C", "A/C/D"])).toEqual(["A", "A/Z", "A/C", "A/C/D", "B"]);
  });
});

describe("folderAfterMove", () => {
  it("renames a folder and what's inside it, and nothing else", () => {
    expect(folderAfterMove("Work", "Work", "Job")).toBe("Job");
    expect(folderAfterMove("Work/Reviews", "Work", "Job")).toBe("Job/Reviews");
    expect(folderAfterMove("Workshop", "Work", "Job")).toBe("Workshop");
    expect(folderAfterMove(null, "Work", "Job")).toBeNull();
  });

  it("moves all of it up when the folder goes", () => {
    expect(folderAfterMove("Work", "Work", null)).toBeNull();
    expect(folderAfterMove("Work/Reviews", "Work", null)).toBe("Reviews");
    expect(folderAfterMove("A/Work", "A/Work", "A")).toBe("A");
    expect(folderAfterMove("A/Work/Reviews", "A/Work", "A")).toBe("A/Reviews");
  });
});

describe("folderNamed", () => {
  const lists: LpmCommandLists = {
    global: list(["Work", "Work/Reviews"]),
    project: null,
    projectError: null,
  };

  it("takes the list's spelling of each level it has", () => {
    expect(folderNamed("work/reviews", "global", lists)).toBe("Work/Reviews");
    expect(folderNamed("WORK/New", "global", lists)).toBe("Work/New");
    expect(folderNamed("Other/New", "global", lists)).toBe("Other/New");
  });

  it("tidies what was typed", () => {
    expect(folderNamed(" Work / Reviews /", "global", lists)).toBe("Work/Reviews");
    expect(folderNamed("/", "global", lists)).toBe("");
  });
});

describe("folderDrop", () => {
  const work = { scope: "global" as const, name: "Work/Reviews" };

  it("puts the folder under the one it's dropped on, or at the top of its list", () => {
    expect(folderDrop(work, folderKey("global", "Home"))).toBe("Home/Reviews");
    expect(folderDrop(work, folderKey("global", null))).toBe("Reviews");
  });

  it("stays put on its own parent, on itself and on what's inside it", () => {
    expect(folderDrop(work, folderKey("global", "Work"))).toBeNull();
    expect(folderDrop(work, folderKey("global", "Work/Reviews"))).toBeNull();
    expect(folderDrop(work, folderKey("global", "Work/Reviews/Deep"))).toBeNull();
    expect(folderDrop({ scope: "global", name: "Work" }, folderKey("global", null))).toBeNull();
  });

  it("stays in its own list", () => {
    expect(folderDrop(work, folderKey("project", "Home"))).toBeNull();
  });

  it("isn't fooled by a neighbour with the same start", () => {
    expect(folderDrop({ scope: "global", name: "Work" }, folderKey("global", "Workshop"))).toBe("Workshop/Work");
  });
});

describe("heldCount", () => {
  it("counts the skills and folders inside, however deep", () => {
    const skill = (folder: string | null) => ({
      name: "x",
      folder,
      description: "",
      body: "",
      scope: "global" as const,
      argumentHint: "",
    });
    const held: CommandScopeList = {
      folders: ["Work", "Work/Reviews", "Workshop"],
      commands: [skill("Work"), skill("Work/Reviews"), skill("Workshop"), skill(null)],
      others: [{ name: "o", description: "", preview: "", agents: [], path: "", folder: "Work/Reviews" }],
    };
    expect(heldCount(held, "Work")).toBe(4);
    expect(heldCount(held, "Workshop")).toBe(1);
    expect(heldCount(list(["Empty"]), "Empty")).toBe(0);
  });
});

describe("indents", () => {
  it("steps in with each level", () => {
    expect(folderIndent(0)).toBe(6);
    expect(folderIndent(1)).toBeGreaterThan(folderIndent(0));
    expect(skillIndent(0)).toBe(8);
    expect(skillIndent(1)).toBe(28);
    expect(skillIndent(2)).toBeGreaterThan(skillIndent(1));
  });
});

describe("innermostTarget", () => {
  const rect = (top: number, left: number, width: number, height: number) => ({
    top,
    left,
    width,
    height,
    bottom: top + height,
    right: left + width,
  });

  it("picks the folder inside over the parent around it", () => {
    const rects = new Map([
      ["parent", rect(0, 0, 300, 200)],
      ["child", rect(40, 0, 300, 60)],
    ]);
    const hits = innermostTarget({
      droppableRects: rects,
      droppableContainers: [{ id: "parent" }, { id: "child" }],
      pointerCoordinates: { x: 150, y: 60 },
      active: {},
      collisionRect: rect(0, 0, 1, 1),
    } as unknown as Parameters<typeof innermostTarget>[0]);
    expect(hits.map((h) => h.id)).toEqual(["child", "parent"]);
  });
});
