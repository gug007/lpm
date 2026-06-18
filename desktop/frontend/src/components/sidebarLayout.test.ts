import { describe, it, expect } from "vitest";
import type { ProjectGroup } from "../types";
import {
  type SidebarLayout,
  groupToken,
  groupIdOf,
  dropFolderTarget,
  folderNestId,
  folderBodyId,
  membershipMap,
  moveTopLevel,
  moveIntoGroup,
  moveOutOfGroup,
  reorderWithinGroup,
  addGroup,
  removeGroup,
  renameGroup,
  setGroupCollapsed,
  flattenForProjectOrder,
  reconcile,
  layoutsEqual,
  classify,
  resolveSidebarDrop,
} from "./sidebarLayout";

function g(id: string, members: string[], extra: Partial<ProjectGroup> = {}): ProjectGroup {
  return { id, name: id, members, ...extra };
}

// api, [Front: web, admin], scripts, [Exp: e1, e2], landing
function sample(): SidebarLayout {
  return {
    order: ["api", groupToken("Front"), "scripts", groupToken("Exp"), "landing"],
    groups: [g("Front", ["web", "admin"]), g("Exp", ["e1", "e2"])],
  };
}

describe("token helpers", () => {
  it("encodes and decodes group tokens", () => {
    expect(groupToken("x")).toBe("group:x");
    expect(groupIdOf("group:x")).toBe("x");
    expect(groupIdOf("api")).toBeNull();
  });

  it("resolves both folder drop id forms", () => {
    expect(dropFolderTarget(folderNestId("Front"))).toBe("Front");
    expect(dropFolderTarget(folderBodyId("Front"))).toBe("Front");
    expect(dropFolderTarget("api")).toBeNull();
  });

  it("builds a membership map", () => {
    const m = membershipMap(sample().groups);
    expect(m.get("web")).toBe("Front");
    expect(m.get("e2")).toBe("Exp");
    expect(m.get("api")).toBeUndefined();
  });
});

describe("moveTopLevel", () => {
  it("reorders a loose project among top-level slots", () => {
    const next = moveTopLevel(sample(), "landing", 0);
    expect(next.order).toEqual(["landing", "api", "group:Front", "scripts", "group:Exp"]);
  });

  it("reorders a folder token", () => {
    const next = moveTopLevel(sample(), "group:Exp", 0);
    expect(next.order[0]).toBe("group:Exp");
  });
});

describe("moveIntoGroup", () => {
  it("moves a loose project into a folder (default: end)", () => {
    const next = moveIntoGroup(sample(), "api", "Front");
    expect(next.order).toEqual(["group:Front", "scripts", "group:Exp", "landing"]);
    expect(groupIdOf("group:Front")).toBe("Front");
    expect(next.groups[0].members).toEqual(["web", "admin", "api"]);
  });

  it("moves into a folder at a position", () => {
    const next = moveIntoGroup(sample(), "api", "Front", 1);
    expect(next.groups[0].members).toEqual(["web", "api", "admin"]);
  });

  it("moves a member from one folder into another", () => {
    const next = moveIntoGroup(sample(), "web", "Exp", 0);
    expect(next.groups[0].members).toEqual(["admin"]);
    expect(next.groups[1].members).toEqual(["web", "e1", "e2"]);
    expect(next.order).toEqual(sample().order);
  });
});

describe("moveOutOfGroup", () => {
  it("spills a member back to loose at a top-level index", () => {
    const next = moveOutOfGroup(sample(), "web", 0);
    expect(next.groups[0].members).toEqual(["admin"]);
    expect(next.order[0]).toBe("web");
  });
});

describe("reorderWithinGroup", () => {
  it("reorders members in place", () => {
    const next = reorderWithinGroup(sample(), "Front", "admin", 0);
    expect(next.groups[0].members).toEqual(["admin", "web"]);
  });
});

describe("addGroup / removeGroup", () => {
  it("adds a folder token at an index", () => {
    const next = addGroup(sample(), g("New", []), 0);
    expect(next.order[0]).toBe("group:New");
    expect(next.groups.map((x) => x.id)).toContain("New");
  });

  it("removes a folder, spilling members where it sat", () => {
    const next = removeGroup(sample(), "Front");
    expect(next.order).toEqual(["api", "web", "admin", "scripts", "group:Exp", "landing"]);
    expect(next.groups.map((x) => x.id)).toEqual(["Exp"]);
  });
});

describe("renameGroup / setGroupCollapsed", () => {
  it("renames", () => {
    expect(renameGroup(sample(), "Front", "Frontend").groups[0].name).toBe("Frontend");
  });
  it("toggles collapsed, dropping the key when false", () => {
    const collapsed = setGroupCollapsed(sample(), "Front", true);
    expect(collapsed.groups[0].collapsed).toBe(true);
    const expanded = setGroupCollapsed(collapsed, "Front", false);
    expect(expanded.groups[0].collapsed).toBeUndefined();
  });
});

describe("flattenForProjectOrder", () => {
  it("expands folders into their members in display order", () => {
    expect(flattenForProjectOrder(sample())).toEqual([
      "api",
      "web",
      "admin",
      "scripts",
      "e1",
      "e2",
      "landing",
    ]);
  });
});

describe("reconcile", () => {
  const names = ["api", "web", "admin", "scripts", "e1", "e2", "landing"];

  it("is a no-op on an already-consistent layout", () => {
    const r = reconcile(sample(), names);
    expect(layoutsEqual(r, sample())).toBe(true);
  });

  it("drops removed projects from members and order", () => {
    const r = reconcile(sample(), ["api", "web", "scripts", "e1", "landing"]);
    expect(r.groups[0].members).toEqual(["web"]);
    expect(r.groups[1].members).toEqual(["e1"]);
    expect(r.order).not.toContain("admin");
  });

  it("appends brand-new projects as loose at the end", () => {
    const r = reconcile(sample(), [...names, "fresh"]);
    expect(r.order[r.order.length - 1]).toBe("fresh");
  });

  it("dedupes a name claimed by a folder out of the loose order", () => {
    const dirty: SidebarLayout = {
      order: ["api", "web", "group:Front"],
      groups: [g("Front", ["web", "admin"])],
    };
    const r = reconcile(dirty, ["api", "web", "admin"]);
    expect(r.order.filter((t) => t === "web")).toEqual([]);
    expect(r.groups[0].members).toEqual(["web", "admin"]);
  });

  it("appends a folder token missing from order", () => {
    const dirty: SidebarLayout = { order: ["api"], groups: [g("Front", ["web"])] };
    const r = reconcile(dirty, ["api", "web"]);
    expect(r.order).toContain("group:Front");
  });

  it("drops an order token for a folder that no longer exists", () => {
    const dirty: SidebarLayout = { order: ["api", "group:Gone"], groups: [] };
    const r = reconcile(dirty, ["api"]);
    expect(r.order).toEqual(["api"]);
  });
});

describe("classify", () => {
  const l = sample();
  it("identifies a folder token", () => {
    expect(classify(l, "group:Front")).toEqual({ kind: "group", id: "Front" });
  });
  it("identifies a member", () => {
    expect(classify(l, "web")).toEqual({ kind: "member", name: "web", groupId: "Front" });
  });
  it("identifies a loose project", () => {
    expect(classify(l, "api")).toEqual({ kind: "loose", name: "api" });
  });
  it("returns null for unknown ids", () => {
    expect(classify(l, "nope")).toBeNull();
    expect(classify(l, "group:Gone")).toBeNull();
  });
});

describe("resolveSidebarDrop", () => {
  it("nests a loose project dropped on a folder header", () => {
    const r = resolveSidebarDrop(sample(), "api", folderNestId("Front"));
    expect(r?.groups[0].members).toEqual(["web", "admin", "api"]);
    expect(r?.order).not.toContain("api");
  });

  it("nests into an empty folder body", () => {
    const base: SidebarLayout = { order: ["api", "group:Empty"], groups: [g("Empty", [])] };
    const r = resolveSidebarDrop(base, "api", folderBodyId("Empty"));
    expect(r?.groups[0].members).toEqual(["api"]);
  });

  it("ignores nesting a folder into a folder", () => {
    expect(resolveSidebarDrop(sample(), "group:Exp", folderNestId("Front"))).toBeNull();
  });

  it("ignores dropping a member onto its own folder header", () => {
    expect(resolveSidebarDrop(sample(), "web", folderNestId("Front"))).toBeNull();
  });

  it("reorders members within a folder", () => {
    const r = resolveSidebarDrop(sample(), "admin", "web");
    expect(r?.groups[0].members).toEqual(["admin", "web"]);
  });

  it("moves a member into another folder at the target member's slot", () => {
    const r = resolveSidebarDrop(sample(), "web", "e2");
    expect(r?.groups[0].members).toEqual(["admin"]);
    expect(r?.groups[1].members).toEqual(["e1", "web", "e2"]);
  });

  it("extracts a member to loose when dropped on a top-level slot", () => {
    const r = resolveSidebarDrop(sample(), "web", "api");
    expect(r?.groups[0].members).toEqual(["admin"]);
    expect(r?.order[0]).toBe("web");
  });

  it("reorders loose projects and folders at the top level", () => {
    const r = resolveSidebarDrop(sample(), "landing", "api");
    expect(r?.order).toEqual(["landing", "api", "group:Front", "scripts", "group:Exp"]);
    const f = resolveSidebarDrop(sample(), "group:Exp", "api");
    expect(f?.order[0]).toBe("group:Exp");
  });

  it("ignores no-op self drops", () => {
    expect(resolveSidebarDrop(sample(), "api", "api")).toBeNull();
  });
});
