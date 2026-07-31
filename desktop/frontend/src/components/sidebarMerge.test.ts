import { describe, it, expect } from "vitest";
import type { ProjectGroup } from "../types";
import { type SidebarLayout, groupToken, layoutsEqual } from "./sidebarLayout";
import { mergeWithDisk } from "./sidebarMerge";

function g(id: string, members: string[], extra: Partial<ProjectGroup> = {}): ProjectGroup {
  return { id, name: id, members, ...extra };
}

// api, [Front: web, admin], scripts
function base(): SidebarLayout {
  return {
    order: ["api", groupToken("Front"), "scripts"],
    groups: [g("Front", ["web", "admin"])],
  };
}

const all = new Set(["api", "web", "admin", "scripts"]);

describe("mergeWithDisk", () => {
  it("is a no-op when nobody changed anything", () => {
    expect(layoutsEqual(mergeWithDisk(base(), base(), base(), all), base())).toBe(true);
  });

  it("keeps our change when only we changed a project's placement", () => {
    const ours: SidebarLayout = {
      order: ["api", groupToken("Front"), "scripts", "admin"],
      groups: [g("Front", ["web"])],
    };
    const r = mergeWithDisk(ours, base(), base(), all);
    expect(r.groups[0].members).toEqual(["web"]);
    expect(r.order).toEqual(["api", groupToken("Front"), "scripts", "admin"]);
  });

  it("adopts disk's placement for a project we never touched", () => {
    const disk: SidebarLayout = {
      order: ["api", groupToken("Front")],
      groups: [g("Front", ["web", "admin", "scripts"])],
    };
    const r = mergeWithDisk(base(), base(), disk, all);
    expect(r.groups[0].members).toEqual(["web", "admin", "scripts"]);
    expect(r.order).not.toContain("scripts");
  });

  it("resolves a conflict our way when both sides moved the same project", () => {
    const ours: SidebarLayout = {
      order: ["api", groupToken("Front"), "scripts", "web"],
      groups: [g("Front", ["admin"])],
    };
    const disk: SidebarLayout = {
      order: ["api", groupToken("Front")],
      groups: [g("Front", ["web", "admin", "scripts"])],
    };
    const r = mergeWithDisk(ours, base(), disk, all);
    expect(r.order).toContain("web");
    expect(r.groups[0].members).toEqual(["admin", "scripts"]);
  });

  it("keeps a folder we deleted deleted, members and all", () => {
    const ours: SidebarLayout = { order: ["api", "web", "admin", "scripts"], groups: [] };
    const r = mergeWithDisk(ours, base(), base(), all);
    expect(r.groups).toEqual([]);
    expect(r.order).toEqual(["api", "web", "admin", "scripts"]);
  });

  it("adopts a folder created in another instance, with its members", () => {
    const disk: SidebarLayout = {
      order: ["api", groupToken("Front"), groupToken("New")],
      groups: [g("Front", ["web", "admin"]), g("New", ["scripts"])],
    };
    const r = mergeWithDisk(base(), base(), disk, all);
    expect(r.groups.map((x) => x.id)).toEqual(["Front", "New"]);
    expect(r.groups[1].members).toEqual(["scripts"]);
    expect(r.order).toContain(groupToken("New"));
    expect(r.order).not.toContain("scripts");
  });

  it("gives an adopted folder a token even when disk's order lacks one", () => {
    const disk: SidebarLayout = { ...base(), groups: [...base().groups, g("New", [])] };
    const r = mergeWithDisk(base(), base(), disk, all);
    expect(r.order[r.order.length - 1]).toBe(groupToken("New"));
  });

  it("restores a whole layout when our copy is empty (never hydrated)", () => {
    const empty: SidebarLayout = { order: [], groups: [] };
    const r = mergeWithDisk(empty, empty, base(), all);
    expect(layoutsEqual(r, base())).toBe(true);
  });

  it("never adopts a name that no longer names a project", () => {
    const disk: SidebarLayout = {
      order: ["api", groupToken("Front"), "ghost"],
      groups: [g("Front", ["web", "admin", "gone"])],
    };
    const r = mergeWithDisk(base(), base(), disk, all);
    expect(r.groups[0].members).toEqual(["web", "admin"]);
    expect(r.order).not.toContain("ghost");
  });

  it("keeps a name only we hold, and doesn't let disk re-place it", () => {
    const ours: SidebarLayout = {
      order: ["api", groupToken("Front"), "scripts"],
      groups: [g("Front", ["web", "admin", "unseen"])],
    };
    const disk: SidebarLayout = { ...base(), order: [...base().order, "unseen"] };
    const r = mergeWithDisk(ours, ours, disk, all);
    expect(r.groups[0].members).toEqual(["web", "admin", "unseen"]);
    expect(r.order).not.toContain("unseen");
  });

  it("degrades a placement into a folder both sides dropped to a loose slot", () => {
    const ours: SidebarLayout = { order: ["api", "web", "admin", "scripts"], groups: [] };
    const disk: SidebarLayout = {
      order: ["api", groupToken("Front")],
      groups: [g("Front", ["web", "admin", "scripts"])],
    };
    const r = mergeWithDisk(ours, base(), disk, all);
    expect(r.groups).toEqual([]);
    expect(r.order).toEqual(["api", "web", "admin", "scripts"]);
  });

  it("adopts a loose project disk has and we don't", () => {
    const ours: SidebarLayout = { order: ["api"], groups: [] };
    const r = mergeWithDisk(ours, ours, { order: ["api", "scripts"], groups: [] }, all);
    expect(r.order).toEqual(["api", "scripts"]);
  });

  it("places an adopted name once when disk lists it loose and in a folder", () => {
    const ours: SidebarLayout = { order: ["api", groupToken("Front")], groups: [g("Front", [])] };
    const disk: SidebarLayout = {
      order: ["api", groupToken("Front"), "scripts"],
      groups: [g("Front", ["scripts"])],
    };
    const r = mergeWithDisk(ours, ours, disk, all);
    expect(r.groups[0].members).toEqual(["scripts"]);
    expect(r.order).not.toContain("scripts");
  });
});
