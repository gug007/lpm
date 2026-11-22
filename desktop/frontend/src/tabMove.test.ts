import { describe, expect, it } from "vitest";
import { moveDestinations } from "./tabMove";
import { GLOBAL_TERMINALS_KEY } from "./terminals";
import type { ProjectInfo } from "./types";

const project = (name: string, extra: Partial<ProjectInfo> = {}) => ({ name, isRemote: false, ...extra }) as ProjectInfo;

const projects = [
  project("bowen"),
  project("api", { label: "API" }),
  project("ssh-box", { isRemote: true }),
  project("peer-abcd1234-server"),
  project("peer-abcd1234-site"),
  project("peer-ffff0000-laptop"),
];

describe("moveDestinations", () => {
  it("offers this computer's other projects, then the Terminals", () => {
    expect(moveDestinations("bowen", projects).map((d) => d.label)).toEqual(["API", "Terminals"]);
  });

  it("from the Terminals, offers this computer's projects", () => {
    expect(moveDestinations(GLOBAL_TERMINALS_KEY, projects).map((d) => d.name)).toEqual(["api", "bowen"]);
  });

  it("a tab on a connected computer stays on that computer", () => {
    expect(moveDestinations("peer-abcd1234-server", projects).map((d) => d.name)).toEqual(["peer-abcd1234-site"]);
  });

  it("a tab running on a remote host has nowhere to go", () => {
    expect(moveDestinations("ssh-box", projects)).toEqual([]);
  });

  it("leaves out a project archived but opened for now", () => {
    const list = [...projects, project("old", { archived: true })];
    expect(moveDestinations("bowen", list).map((d) => d.name)).not.toContain("old");
  });
});
