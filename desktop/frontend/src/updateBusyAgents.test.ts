import { describe, expect, it } from "vitest";
import { busyAgentPlaces } from "./updateBusyAgents";
import { GLOBAL_TERMINALS_KEY } from "./terminals";
import {
  STATUS_DONE,
  STATUS_ERROR,
  STATUS_RUNNING,
  STATUS_WAITING,
  type ProjectInfo,
  type StatusEntry,
} from "./types";

const NOW = 1_700_000_000_000;

const entry = (key: string, value: string, paneID = `%${key}`): StatusEntry => ({
  key,
  value,
  priority: 0,
  timestamp: NOW,
  paneID,
});

function project(name: string, statusEntries: StatusEntry[], over: Partial<ProjectInfo> = {}): ProjectInfo {
  return {
    name,
    session: name,
    root: `/Users/dev/${name}`,
    running: false,
    services: [],
    allServices: [],
    actions: [],
    profiles: [],
    activeProfile: "",
    statusEntries,
    isRemote: false,
    ...over,
  };
}

describe("busyAgentPlaces", () => {
  it("is empty when no agent is mid-task", () => {
    const projects = [
      project("api", [entry("claude_code_a", STATUS_DONE), entry("codex_b", STATUS_ERROR)]),
      project("web", []),
    ];
    expect(busyAgentPlaces(projects, [], NOW)).toEqual([]);
  });

  it("counts working and waiting agents per project, by its shown name", () => {
    const projects = [
      project("api", [
        entry("claude_code_a", STATUS_RUNNING),
        entry("codex_b", STATUS_WAITING),
        entry("claude_code_c", STATUS_DONE),
      ], { label: "Backend" }),
      project("web", [entry("claude_code_d", STATUS_RUNNING)]),
    ];
    expect(busyAgentPlaces(projects, [], NOW)).toEqual([
      { key: "api", name: "Backend", count: 2 },
      { key: "web", name: "web", count: 1 },
    ]);
  });

  it("counts a tab once when several agents report on it", () => {
    const projects = [
      project("api", [
        entry("claude_code_a", STATUS_RUNNING, "%1"),
        entry("codex_b", STATUS_RUNNING, "%1"),
      ]),
    ];
    expect(busyAgentPlaces(projects, [], NOW)).toEqual([{ key: "api", name: "api", count: 1 }]);
  });

  it("includes the global Terminals first", () => {
    const projects = [project("api", [entry("claude_code_a", STATUS_RUNNING)])];
    const terminals = [entry("codex_t", STATUS_WAITING)];
    expect(busyAgentPlaces(projects, terminals, NOW)).toEqual([
      { key: GLOBAL_TERMINALS_KEY, name: "Terminals", count: 1 },
      { key: "api", name: "api", count: 1 },
    ]);
  });

  it("leaves out a paired machine's projects, whose agents keep running there", () => {
    const projects = [project("peer-0a1b2c3d-api", [entry("claude_code_a", STATUS_RUNNING)])];
    expect(busyAgentPlaces(projects, [], NOW)).toEqual([]);
  });
});
