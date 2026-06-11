import { describe, it, expect } from "vitest";
import { buildLevelMap, levelOf } from "./actionLevels";

const project = `
actions:
  proj_only:
    cmd: echo p
  global_pos_override:
    position: 2
`;
const repo = `
actions:
  repo_menu:
    actions:
      child_a:
        cmd: echo a
`;
const global = `
actions:
  global_only:
    cmd: echo g
  global_pos_override:
    cmd: echo go
`;

describe("buildLevelMap", () => {
  const map = buildLevelMap({ project, repo, global });

  it("maps a project-defined action to project", () => {
    expect(map.get("proj_only")).toBe("project");
  });

  it("maps a repo-defined menu to repo", () => {
    expect(map.get("repo_menu")).toBe("repo");
  });

  it("maps a global-defined action to global", () => {
    expect(map.get("global_only")).toBe("global");
  });

  it("treats a project position-only override as global (body lives in global)", () => {
    expect(map.get("global_pos_override")).toBe("global");
  });
});

describe("levelOf", () => {
  const map = buildLevelMap({ project, repo, global });

  it("resolves a top-level id directly", () => {
    expect(levelOf(map, "proj_only")).toBe("project");
  });

  it("resolves a child id via its parent", () => {
    expect(levelOf(map, "repo_menu:child_a")).toBe("repo");
  });

  it("returns null for an unknown id", () => {
    expect(levelOf(map, "nope")).toBe(null);
  });
});
