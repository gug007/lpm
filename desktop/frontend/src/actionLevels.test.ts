import { describe, it, expect, vi } from "vitest";
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

  it("resolves a deep path via its root ancestor segment", () => {
    expect(levelOf(map, "repo_menu:iOS:child_a")).toBe("repo");
  });

  it("returns null for an unknown id", () => {
    expect(levelOf(map, "nope")).toBe(null);
  });
});

describe("loadLevelMap", () => {
  it("gives a paired Mac's project no level outside its own file", async () => {
    vi.resetModules();
    const read = (content: string) => ({ read: vi.fn().mockResolvedValue(content) });
    const globalRead = read(global);
    const repoRead = read(repo);
    vi.doMock("./yamlQueue", () => ({
      projectLayer: () => read(project),
      repoLayer: () => repoRead,
      globalLayer: globalRead,
    }));
    const { loadLevelMap, levelOf: level } = await import("./actionLevels");
    const map = await loadLevelMap("peer-0123abcd-app");
    expect(level(map, "proj_only")).toBe("project");
    expect(level(map, "global_only")).toBeNull();
    expect(level(map, "repo_menu:child_a")).toBeNull();
    expect(globalRead.read).not.toHaveBeenCalled();
    expect(repoRead.read).not.toHaveBeenCalled();
    const local = await loadLevelMap("app");
    expect(level(local, "global_only")).toBe("global");
    vi.doUnmock("./yamlQueue");
  });
});
