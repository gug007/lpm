import { describe, expect, it } from "vitest";
import { projectAgentRows, sidebarProjectAlert, type SidebarAgentRow } from "./sidebarAgents";
import {
  STATUS_DONE,
  STATUS_ERROR,
  STATUS_RUNNING,
  STATUS_WAITING,
  type ProjectInfo,
  type StatusEntry,
} from "./types";

const NOW = 1_700_000_000_000;

const entry = (key: string, value: string, ago = 0): StatusEntry => ({
  key,
  value,
  priority: 0,
  timestamp: NOW - ago,
  paneID: `%${key}`,
});

function project(over: Partial<ProjectInfo> = {}): ProjectInfo {
  return {
    name: "app",
    session: "app",
    root: "/Users/dev/app",
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

describe("projectAgentRows", () => {
  it("lists agents in the order their tabs sit in", () => {
    const agents = projectAgentRows(
      project({
        statusEntries: [
          entry("codex_1", STATUS_RUNNING, 60_000),
          entry("claude_code_a", STATUS_DONE, 10_000),
          entry("claude_code_b", STATUS_WAITING, 30_000),
        ],
      }),
      NOW,
      { "%claude_code_a": "Ship it", "%codex_1": "Rebalance", "%claude_code_b": "Port tests" },
    );
    expect(agents.map((a: SidebarAgentRow) => a.key)).toEqual([
      "claude_code_a",
      "codex_1",
      "claude_code_b",
    ]);
    expect(agents[0].provider).toBe("Claude Code");
    expect(agents[1].provider).toBe("Codex");
    expect(agents[0].terminalId).toBe("%claude_code_a");
  });

  it("trails an agent whose tab this window can't name, most urgent first", () => {
    const agents = projectAgentRows(
      project({
        statusEntries: [
          entry("codex_1", STATUS_RUNNING, 60_000),
          entry("claude_code_a", STATUS_DONE, 10_000),
          entry("claude_code_b", STATUS_WAITING, 30_000),
        ],
      }),
      NOW,
      { "%codex_1": "Rebalance" },
    );
    expect(agents.map((a: SidebarAgentRow) => a.key)).toEqual([
      "codex_1",
      "claude_code_b",
      "claude_code_a",
    ]);
  });

  it("orders agents by attention with no tab order to follow", () => {
    const agents = projectAgentRows(
      project({
        statusEntries: [
          entry("codex_1", STATUS_RUNNING, 60_000),
          entry("claude_code_a", STATUS_DONE, 10_000),
          entry("claude_code_b", STATUS_WAITING, 30_000),
          entry("codex_2", STATUS_RUNNING, 5_000),
        ],
      }),
      NOW,
    );
    expect(agents.map((a: SidebarAgentRow) => a.key)).toEqual([
      "claude_code_b",
      "codex_2",
      "codex_1",
      "claude_code_a",
    ]);
  });

  it("names each agent after its tab, falling back to the agent itself", () => {
    const agents = projectAgentRows(
      project({
        statusEntries: [entry("codex_1", STATUS_RUNNING), entry("codex_2", STATUS_RUNNING)],
      }),
      NOW,
      { "%codex_1": "Rebalance worker" },
    );
    expect(agents.map((a: SidebarAgentRow) => a.title)).toEqual(["Rebalance worker", "Codex"]);
  });

  it("times a finished turn by how long it took, and a wait by how long it has waited", () => {
    const done = { ...entry("codex_1", STATUS_DONE), turnStart: NOW - 90_000, endedAt: NOW - 5_000 };
    const agents = projectAgentRows(
      project({ statusEntries: [done, entry("claude_code_a", STATUS_WAITING, 30_000)] }),
      NOW,
    );
    const waiting = agents[0];
    expect(waiting.since).toBe(NOW - 30_000);
    expect(waiting.until).toBeUndefined();
    expect(agents[1]).toMatchObject({ since: NOW - 90_000, until: NOW - 5_000 });
  });

  it("dates an entry stamped ahead by a paired Mac's clock from now", () => {
    const agents = projectAgentRows(
      project({ statusEntries: [entry("codex_1", STATUS_RUNNING, -60_000)] }),
      NOW,
    );
    expect(agents[0].since).toBe(NOW);
  });

  it("has no rows for a project no agent has reported on", () => {
    expect(projectAgentRows(project(), NOW)).toEqual([]);
    // A status nothing acts on is still an agent sitting in a terminal.
    expect(
      projectAgentRows(project({ statusEntries: [entry("codex_1", "Compacting")] }), NOW),
    ).toHaveLength(1);
  });
});

describe("sidebarProjectAlert", () => {
  it("speaks only for an agent that hit a problem", () => {
    // A wait outranks a problem in the rows underneath, but up here the problem
    // is the only thing that gets a word.
    const both = projectAgentRows(
      project({
        statusEntries: [entry("codex_1", STATUS_ERROR), entry("claude_code_a", STATUS_WAITING)],
      }),
      NOW,
    );
    expect(sidebarProjectAlert(both)?.key).toBe("codex_1");

    // Everything else says its piece in the rows underneath.
    for (const value of [STATUS_WAITING, STATUS_RUNNING, STATUS_DONE, "Compacting"]) {
      const quiet = projectAgentRows(project({ statusEntries: [entry("codex_1", value)] }), NOW);
      expect(sidebarProjectAlert(quiet)).toBeNull();
    }
  });
});

