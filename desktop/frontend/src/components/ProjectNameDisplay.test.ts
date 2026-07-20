import { describe, it, expect } from "vitest";
import type { ProjectInfo } from "../types";
import {
  displayNameForProjectName,
  findParentProject,
  projectDisplayName,
} from "./ProjectNameDisplay";

function proj(over: Partial<ProjectInfo>): ProjectInfo {
  return {
    name: "p",
    session: "",
    root: "/root",
    running: false,
    services: [],
    allServices: [],
    actions: [],
    profiles: [],
    activeProfile: "",
    statusEntries: [],
    isRemote: false,
    ...over,
  };
}

describe("projectDisplayName", () => {
  it("prefers an explicit label", () => {
    expect(projectDisplayName(proj({ name: "lpm", label: "My App" }))).toBe("My App");
  });

  it("inherits the parent's label for an unlabeled duplicate", () => {
    const parent = proj({ name: "lpm", label: "My App" });
    const dup = proj({ name: "lpm-2", parentName: "lpm" });
    expect(projectDisplayName(dup, parent)).toBe("My App-2");
  });

  it("uses the parent's raw name when the parent has no label", () => {
    const parent = proj({ name: "lpm" });
    const dup = proj({ name: "lpm-2", parentName: "lpm" });
    expect(projectDisplayName(dup, parent)).toBe("lpm-2");
  });

  it("falls back to the raw name when neither label nor parent applies", () => {
    expect(projectDisplayName(proj({ name: "lpm" }))).toBe("lpm");
  });
});

describe("displayNameForProjectName", () => {
  const projects = [
    proj({ name: "lpm", label: "My App" }),
    proj({ name: "lpm-2", parentName: "lpm" }),
    proj({ name: "solo" }),
  ];

  it("resolves a labeled project by its raw name", () => {
    expect(displayNameForProjectName("lpm", projects)).toBe("My App");
  });

  it("resolves an unlabeled duplicate to the inherited name", () => {
    expect(displayNameForProjectName("lpm-2", projects)).toBe("My App-2");
  });

  it("returns the raw name for a name with no matching project", () => {
    expect(displayNameForProjectName("ghost", projects)).toBe("ghost");
  });
});

describe("findParentProject", () => {
  it("finds the parent named by a duplicate", () => {
    const projects = [proj({ name: "lpm" }), proj({ name: "lpm-2", parentName: "lpm" })];
    expect(findParentProject(projects[1], projects)?.name).toBe("lpm");
  });

  it("returns undefined for a non-duplicate", () => {
    const projects = [proj({ name: "lpm" })];
    expect(findParentProject(projects[0], projects)).toBeUndefined();
  });
});
