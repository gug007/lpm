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

  it("gives a tab one line however many agents report on it, and counts the rest", () => {
    // An agent that shells out to another one borrows its tab's pane id, so the
    // second agent would otherwise open a second line under the same tab name.
    const shared = (key: string, value: string, ago = 0): StatusEntry => ({
      ...entry(key, value, ago),
      paneID: "%1",
    });
    const agents = projectAgentRows(
      project({
        statusEntries: [
          shared("claude_code_main", STATUS_RUNNING, 90_000),
          shared("claude_code_nested", STATUS_DONE, 5_000),
          entry("codex_1", STATUS_RUNNING, 60_000),
        ],
      }),
      NOW,
      { "%1": "Ultracode", "%codex_1": "Rebalance" },
    );
    expect(agents.map((a: SidebarAgentRow) => [a.title, a.shared])).toEqual([
      ["Ultracode", 1],
      ["Rebalance", 0],
    ]);
    // The tab reads as its most urgent agent, not as whichever reported last.
    expect(agents[0].key).toBe("claude_code_main");
  });

  it("keeps a line for every agent that names no tab", () => {
    // `lpm set-status` leaves --pane optional; those are nobody's duplicate.
    const paneless = (key: string, value: string): StatusEntry => ({
      key,
      value,
      priority: 0,
      timestamp: NOW,
    });
    const agents = projectAgentRows(
      project({
        statusEntries: [paneless("deploy", STATUS_RUNNING), paneless("backup", STATUS_RUNNING)],
      }),
      NOW,
    );
    expect(agents).toHaveLength(2);
    expect(agents.every((a: SidebarAgentRow) => a.shared === 0)).toBe(true);
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

    // A problem folded behind a question on the same tab still gets its word:
    // needs-you outranks error, so the row reads as the wait, and the project
    // row above would otherwise fall silent about the problem entirely.
    const folded = projectAgentRows(
      project({
        statusEntries: [
          { ...entry("claude_code_wait", STATUS_WAITING), paneID: "%1" },
          { ...entry("claude_code_broken", STATUS_ERROR), paneID: "%1" },
        ],
      }),
      NOW,
    );
    expect(folded).toHaveLength(1);
    expect(folded[0].state).toBe("needs-you");
    expect(sidebarProjectAlert(folded)?.key).toBe("claude_code_wait");

    // Everything else says its piece in the rows underneath.
    for (const value of [STATUS_WAITING, STATUS_RUNNING, STATUS_DONE, "Compacting"]) {
      const quiet = projectAgentRows(project({ statusEntries: [entry("codex_1", value)] }), NOW);
      expect(sidebarProjectAlert(quiet)).toBeNull();
    }
  });
});

