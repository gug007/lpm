import { describe, it, expect } from "vitest";
import type { ProjectGroup, ProjectInfo } from "../types";
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
  nestedDuplicates,
  resolveDuplicateDrop,
  reconcile,
  forgetProjects,
  layoutsEqual,
  classify,
  rangeBetween,
  resolveSidebarDrop,
  isPeerToken,
  peerSlugOfToken,
  peerToken,
  syncPeerTokens,
} from "./sidebarLayout";

function g(id: string, members: string[], extra: Partial<ProjectGroup> = {}): ProjectGroup {
  return { id, name: id, members, ...extra };
}

function p(name: string, parentName?: string): ProjectInfo {
  return { name, parentName } as ProjectInfo;
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

  it("encodes and decodes peer tokens", () => {
    expect(peerToken("a1b2c3d4")).toBe("peer:a1b2c3d4");
    expect(peerSlugOfToken("peer:a1b2c3d4")).toBe("a1b2c3d4");
    expect(peerSlugOfToken("group:Front")).toBeNull();
    expect(peerSlugOfToken("api")).toBeNull();
    expect(isPeerToken("peer:a1b2c3d4")).toBe(true);
    expect(isPeerToken("api")).toBe(false);
  });
});

describe("syncPeerTokens", () => {
  it("appends a slot for a newly paired Mac at the end", () => {
    expect(syncPeerTokens(["api", groupToken("Front")], ["m1"])).toEqual([
      "api",
      groupToken("Front"),
      peerToken("m1"),
    ]);
  });

  it("leaves a placed slot where the user put it", () => {
    const order = [peerToken("m1"), "api", groupToken("Front")];
    expect(syncPeerTokens(order, ["m1"])).toBe(order);
  });

  it("drops the slot of a Mac that is no longer paired", () => {
    expect(syncPeerTokens([peerToken("m1"), "api", peerToken("m2")], ["m2"])).toEqual([
      "api",
      peerToken("m2"),
    ]);
  });

  it("keeps placed slots and appends only the missing ones", () => {
    expect(syncPeerTokens([peerToken("m1"), "api"], ["m1", "m2"])).toEqual([
      peerToken("m1"),
      "api",
      peerToken("m2"),
    ]);
  });

  it("drops every slot when nothing is paired", () => {
    expect(syncPeerTokens([peerToken("m1"), "api"], [])).toEqual(["api"]);
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

describe("nestedDuplicates", () => {
  it("groups duplicates under their parent in project-list order", () => {
    const projects = [p("api"), p("api-2", "api"), p("api-1", "api"), p("web")];
    expect(nestedDuplicates([], projects)).toEqual(new Map([["api", ["api-2", "api-1"]]]));
  });

  it("leaves out a duplicate that is an explicit folder member", () => {
    const projects = [p("api"), p("api-1", "api"), p("api-2", "api")];
    expect(nestedDuplicates([g("Front", ["api-2"])], projects)).toEqual(
      new Map([["api", ["api-1"]]]),
    );
  });

  it("ignores a project whose parent is gone", () => {
    expect(nestedDuplicates([], [p("api-1", "api")])).toEqual(new Map());
  });
});

describe("resolveDuplicateDrop", () => {
  const nested = new Map([["api", ["api-1", "api-2", "api-3"]]]);

  it("takes the sibling slot it was dropped on", () => {
    expect(resolveDuplicateDrop(nested, "api", "api-3", "api-1")).toBe("api-1");
  });

  it("goes to the top of the siblings when dropped on the parent", () => {
    expect(resolveDuplicateDrop(nested, "api", "api-3", "api")).toBe("api-1");
  });

  it("stays put when dropped on itself or outside its siblings", () => {
    expect(resolveDuplicateDrop(nested, "api", "api-2", "api-2")).toBeNull();
    expect(resolveDuplicateDrop(nested, "api", "api-1", "api")).toBeNull();
    expect(resolveDuplicateDrop(nested, "api", "api-2", "web")).toBeNull();
    expect(resolveDuplicateDrop(nested, "api", "api-2", groupToken("Front"))).toBeNull();
  });
});

describe("flattenForProjectOrder", () => {
  it("trails every project with its nested duplicates", () => {
    const projects = [
      p("api"),
      p("api-2", "api"),
      p("api-1", "api"),
      p("web"),
      p("web-1", "web"),
      p("admin"),
      p("scripts"),
      p("e1"),
      p("e2"),
      p("landing"),
    ];
    expect(flattenForProjectOrder(sample(), projects)).toEqual([
      "api",
      "api-2",
      "api-1",
      "web",
      "web-1",
      "admin",
      "scripts",
      "e1",
      "e2",
      "landing",
    ]);
  });

  it("keeps a folder-member duplicate at its own slot", () => {
    const layout: SidebarLayout = {
      order: [groupToken("Front")],
      groups: [g("Front", ["web-1", "web"])],
    };
    const projects = [p("web"), p("web-1", "web"), p("web-2", "web")];
    expect(flattenForProjectOrder(layout, projects)).toEqual(["web-1", "web", "web-2"]);
  });

  it("expands folders into their members in display order", () => {
    expect(flattenForProjectOrder(sample(), [])).toEqual([
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

  it("keeps projects missing from the list in place (a short list is not a removal)", () => {
    const r = reconcile(sample(), ["api", "web", "scripts", "e1", "landing"]);
    expect(r.groups[0].members).toEqual(["web", "admin"]);
    expect(r.groups[1].members).toEqual(["e1", "e2"]);
    expect(layoutsEqual(r, sample())).toBe(true);
  });

  it("keeps the whole layout when the project list comes back empty", () => {
    expect(layoutsEqual(reconcile(sample(), [], []), sample())).toBe(true);
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

  it("keeps a folder member that is a promoted duplicate (in memberNames, not top-level)", () => {
    const dirty: SidebarLayout = {
      order: ["api", groupToken("Front")],
      groups: [g("Front", ["web-copy"])],
    };
    const r = reconcile(dirty, ["api"], ["api", "web-copy"]);
    expect(r.groups[0].members).toEqual(["web-copy"]);
    expect(r.order).toEqual(["api", groupToken("Front")]);
  });

  it("never appends a promoted duplicate member as a loose project", () => {
    const dirty: SidebarLayout = {
      order: [groupToken("Front")],
      groups: [g("Front", ["d1"])],
    };
    const r = reconcile(dirty, [], ["d1"]);
    expect(r.order).toEqual([groupToken("Front")]);
    expect(r.groups[0].members).toEqual(["d1"]);
  });

  it("keeps a member missing from the existing project set", () => {
    const dirty: SidebarLayout = {
      order: ["api", groupToken("Front")],
      groups: [g("Front", ["gone"])],
    };
    const r = reconcile(dirty, ["api"], ["api"]);
    expect(r.groups[0].members).toEqual(["gone"]);
  });

  it("keeps a loose token whose project is missing from the list", () => {
    const dirty: SidebarLayout = { order: ["api", "gone"], groups: [] };
    expect(reconcile(dirty, ["api"], ["api"]).order).toEqual(["api", "gone"]);
  });

  it("still de-dupes an unknown name claimed by two folders", () => {
    const dirty: SidebarLayout = {
      order: [groupToken("A"), groupToken("B")],
      groups: [g("A", ["gone"]), g("B", ["gone"])],
    };
    const r = reconcile(dirty, [], []);
    expect(r.groups[0].members).toEqual(["gone"]);
    expect(r.groups[1].members).toEqual([]);
  });

  it("drops a loose token for a duplicate removed from a folder (no top-level slot)", () => {
    const dirty: SidebarLayout = {
      order: ["api", "web-copy", groupToken("Front")],
      groups: [g("Front", [])],
    };
    const r = reconcile(dirty, ["api"], ["api", "web-copy"]);
    expect(r.order).toEqual(["api", groupToken("Front")]);
    expect(r.groups[0].members).toEqual([]);
  });
});

describe("peer slots in the layout", () => {
  const layout = (): SidebarLayout => ({
    order: [peerToken("m1"), "api", groupToken("Front"), "scripts"],
    groups: [g("Front", ["web", "admin"])],
  });

  it("stays out of the flattened project order", () => {
    expect(flattenForProjectOrder(layout(), [])).toEqual(["api", "web", "admin", "scripts"]);
  });

  it("survives reconcile, which can't see the pairing list", () => {
    const r = reconcile(layout(), ["api", "scripts"], ["api", "scripts", "web", "admin"]);
    expect(r.order).toEqual([peerToken("m1"), "api", groupToken("Front"), "scripts"]);
  });

  it("is never mistaken for a removed project", () => {
    const r = forgetProjects(layout(), ["api"]);
    expect(r.order).toEqual([peerToken("m1"), groupToken("Front"), "scripts"]);
  });
});

describe("forgetProjects", () => {
  it("drops removed names from members and the loose order", () => {
    const r = forgetProjects(sample(), ["admin", "landing"]);
    expect(r.groups[0].members).toEqual(["web"]);
    expect(r.order).toEqual(["api", groupToken("Front"), "scripts", groupToken("Exp")]);
  });

  it("keeps folder tokens and is a no-op for an empty removal", () => {
    expect(layoutsEqual(forgetProjects(sample(), []), sample())).toBe(true);
    const r = forgetProjects(sample(), ["group:Front"]);
    expect(r.order).toContain(groupToken("Front"));
  });

  it("survives a name that isn't in the layout", () => {
    expect(layoutsEqual(forgetProjects(sample(), ["nope"]), sample())).toBe(true);
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
  it("identifies a peer section slot", () => {
    const withPeer: SidebarLayout = { ...l, order: [peerToken("m1"), ...l.order] };
    expect(classify(withPeer, peerToken("m1"))).toEqual({ kind: "peer", slug: "m1" });
  });
  it("returns null for unknown ids", () => {
    expect(classify(l, "nope")).toBeNull();
    expect(classify(l, "group:Gone")).toBeNull();
    expect(classify(l, peerToken("m1"))).toBeNull();
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

// api, [Front: web, admin], scripts, peer m1
function withPeer(): SidebarLayout {
  return {
    order: ["api", groupToken("Front"), "scripts", peerToken("m1")],
    groups: [g("Front", ["web", "admin"])],
  };
}

describe("resolveSidebarDrop with peer sections", () => {
  it("lifts a peer section above the local projects", () => {
    const r = resolveSidebarDrop(withPeer(), peerToken("m1"), "api");
    expect(r?.order).toEqual([peerToken("m1"), "api", groupToken("Front"), "scripts"]);
  });

  it("reorders a peer section against a folder", () => {
    const r = resolveSidebarDrop(withPeer(), peerToken("m1"), groupToken("Front"));
    expect(r?.order).toEqual(["api", peerToken("m1"), groupToken("Front"), "scripts"]);
  });

  it("never nests a peer section into a folder", () => {
    expect(resolveSidebarDrop(withPeer(), peerToken("m1"), folderNestId("Front"))).toBeNull();
    expect(resolveSidebarDrop(withPeer(), peerToken("m1"), folderBodyId("Front"))).toBeNull();
    expect(resolveSidebarDrop(withPeer(), peerToken("m1"), "web")).toBeNull();
  });

  it("takes no members: a project dropped on a section only reorders", () => {
    const r = resolveSidebarDrop(withPeer(), "api", peerToken("m1"));
    expect(r?.order).toEqual([groupToken("Front"), "scripts", peerToken("m1"), "api"]);
    expect(r?.groups[0].members).toEqual(["web", "admin"]);
  });

  it("extracts a folder member dropped on a section", () => {
    const r = resolveSidebarDrop(withPeer(), "web", peerToken("m1"));
    expect(r?.groups[0].members).toEqual(["admin"]);
    expect(r?.order).toEqual(["api", groupToken("Front"), "scripts", "web", peerToken("m1")]);
  });
});

describe("rangeBetween", () => {
  const order = ["a", "b", "c", "d", "e", "f"];

  it("returns the inclusive forward span", () => {
    expect(rangeBetween(order, "b", "e")).toEqual(["b", "c", "d", "e"]);
  });

  it("is order-independent (backward span matches forward)", () => {
    expect(rangeBetween(order, "e", "b")).toEqual(["b", "c", "d", "e"]);
  });

  it("returns a single element when endpoints match", () => {
    expect(rangeBetween(order, "c", "c")).toEqual(["c"]);
  });

  it("spans the full list", () => {
    expect(rangeBetween(order, "a", "f")).toEqual(order);
  });

  it("returns empty when an endpoint is absent", () => {
    expect(rangeBetween(order, "a", "z")).toEqual([]);
    expect(rangeBetween(order, "z", "a")).toEqual([]);
  });
});
