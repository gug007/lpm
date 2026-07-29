import { describe, expect, it } from "vitest";
import {
  buildFleet,
  fleetElapsedLabel,
  type Fleet,
  type FleetJob,
  type FleetRow,
  type FleetSnapshot,
} from "./fleetRows";
import {
  STATUS_DONE,
  STATUS_ERROR,
  STATUS_RUNNING,
  STATUS_WAITING,
  type ProjectInfo,
  type ServiceInfo,
  type StatusEntry,
} from "./types";

const T0 = 1_700_000_000_000;

function entry(
  key: string,
  value: string,
  paneID = "pty-1",
  timestamp = T0,
): StatusEntry {
  return { key, value, priority: 0, timestamp, paneID };
}

function service(name: string): ServiceInfo {
  return { name, cmd: "npm run dev", cwd: "/tmp", port: 0 };
}

function project(over: Partial<ProjectInfo> & { name: string }): ProjectInfo {
  return {
    session: over.name,
    root: `/Users/dev/${over.name}`,
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

function job(over: Partial<FleetJob> & { id: string }): FleetJob {
  return { valid: true, enabled: true, ...over };
}

function build(over: Partial<FleetSnapshot> & { now: number }): Fleet {
  return buildFleet({
    projects: [],
    jobs: [],
    filter: {},
    peerAliases: {},
    terminalTitles: {},
    ...over,
  });
}

const ids = (rows: FleetRow[]) => rows.map((r) => r.id);

describe("attention ordering", () => {
  it("puts needs-you first, then error, working, done, and silent last", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "app",
          statusEntries: [
            entry("claude_code_done", STATUS_DONE, "pty-1"),
            entry("claude_code_quiet", "Compacting", "pty-2"),
            entry("claude_code_run", STATUS_RUNNING, "pty-3"),
            entry("codex_err", STATUS_ERROR, "pty-4"),
            entry("claude_code_wait", STATUS_WAITING, "pty-5"),
          ],
        }),
      ],
    });
    expect(fleet.rows.map((r) => r.state)).toEqual([
      "needs-you",
      "error",
      "working",
      "done",
      "idle",
    ]);
  });

  it("orders the longest-held state first within a state", () => {
    const fleet = build({
      now: T0 + 120_000,
      projects: [
        project({
          name: "app",
          statusEntries: [
            entry("claude_code_new", STATUS_WAITING, "pty-2", T0 + 110_000),
            entry("claude_code_old", STATUS_WAITING, "pty-1", T0),
          ],
        }),
      ],
    });

    expect(ids(fleet.rows)).toEqual([
      "agent:app:claude_code_old",
      "agent:app:claude_code_new",
    ]);
    expect(fleet.rows[0].stateSince).toBe(T0);
    expect(fleet.rows[1].stateSince).toBe(T0 + 110_000);
  });

  it("ages an agent from its own status time, not from when Fleet opened", () => {
    const fleet = build({
      now: T0 + 40 * 60_000,
      projects: [
        project({
          name: "app",
          statusEntries: [entry("claude_code_w", STATUS_WAITING, "pty-1", T0)],
        }),
      ],
    });
    expect(fleetElapsedLabel(fleet.rows[0], T0 + 40 * 60_000)).toBe("waiting 40m");
  });

  it("reads a paired Mac's future-stamped status as no time at all", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "peer-abcdef12-app",
          label: "app",
          statusEntries: [
            entry("claude_code_ahead", STATUS_WAITING, "pty-1", T0 + 600_000),
          ],
        }),
      ],
    });
    expect(fleet.rows[0].stateSince).toBe(T0);
    expect(fleetElapsedLabel(fleet.rows[0], T0)).toBe("waiting 0s");
  });

  it("never lets a clock running ahead outrank a genuinely older row", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "peer-abcdef12-app",
          label: "app",
          statusEntries: [
            entry("claude_code_ahead", STATUS_WAITING, "pty-1", T0 + 600_000),
          ],
        }),
        project({
          name: "app",
          statusEntries: [
            entry("claude_code_here", STATUS_WAITING, "pty-2", T0 - 600_000),
          ],
        }),
      ],
    });
    expect(ids(fleet.rows)).toEqual([
      "agent:app:claude_code_here",
      "agent:peer-abcdef12-app:claude_code_ahead",
    ]);
  });

  it("starts an unstamped status now rather than in 1970", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "app",
          statusEntries: [entry("claude_code_w", STATUS_WAITING, "pty-1", 0)],
        }),
      ],
    });
    expect(fleet.rows[0].stateSince).toBe(T0);
    expect(fleetElapsedLabel(fleet.rows[0], T0)).toBe("waiting 0s");
  });

  it("puts an older approval above a newer one whose id sorts earlier", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "app",
          statusEntries: [
            entry("claude_code_a", STATUS_WAITING, "pty-1", T0 - 10_000),
            entry("claude_code_z", STATUS_WAITING, "pty-2", T0 - 40 * 60_000),
          ],
        }),
      ],
    });
    expect(ids(fleet.rows)).toEqual([
      "agent:app:claude_code_z",
      "agent:app:claude_code_a",
    ]);
  });

  it("breaks equal timestamps on the stable id, in either input order", () => {
    const entries = [
      entry("claude_code_b", STATUS_WAITING, "pty-1"),
      entry("claude_code_a", STATUS_WAITING, "pty-2"),
      entry("claude_code_c", STATUS_WAITING, "pty-3"),
    ];
    const forward = build({
      now: T0,
      projects: [project({ name: "app", statusEntries: entries })],
    });
    const reversed = build({
      now: T0,
      projects: [project({ name: "app", statusEntries: [...entries].reverse() })],
    });
    expect(ids(forward.rows)).toEqual([
      "agent:app:claude_code_a",
      "agent:app:claude_code_b",
      "agent:app:claude_code_c",
    ]);
    expect(ids(reversed.rows)).toEqual(ids(forward.rows));
  });

  it("sorts a long-running automation ahead of a fresh agent in the same state", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "app",
          statusEntries: [entry("claude_code_run", STATUS_RUNNING)],
        }),
      ],
      jobs: [
        job({
          id: "nightly",
          label: "Nightly sweep",
          running: true,
          runningSince: Math.floor(T0 / 1000) - 600,
          project: "app",
          targets: ["app"],
        }),
      ],
    });
    expect(ids(fleet.rows)).toEqual([
      "automation:app:nightly",
      "agent:app:claude_code_run",
    ]);
  });
});

describe("dismissable rule", () => {
  it("allows dismissing a lone Done row", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "app",
          statusEntries: [entry("claude_code_a", STATUS_DONE, "pty-1")],
        }),
      ],
    });
    expect(fleet.rows[0].dismissable).toBe(true);
    expect(fleet.rows[0].dismissBlocked).toBeNull();
  });

  it("blocks both rows when two share a terminal and a value", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "app",
          statusEntries: [
            entry("claude_code_a", STATUS_DONE, "pty-1"),
            entry("codex_b", STATUS_DONE, "pty-1"),
          ],
        }),
      ],
    });
    expect(fleet.rows.map((r) => r.dismissable)).toEqual([false, false]);
    expect(fleet.rows[0].dismissBlocked).toContain("shares this terminal");
  });

  it("keeps rows dismissable when they share a terminal but not a value", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "app",
          statusEntries: [
            entry("claude_code_a", STATUS_DONE, "pty-1"),
            entry("codex_b", STATUS_ERROR, "pty-1"),
          ],
        }),
      ],
    });
    expect(fleet.rows.every((r) => r.dismissable)).toBe(true);
  });

  it("treats the same value on different projects as separate", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "app",
          statusEntries: [entry("claude_code_a", STATUS_DONE, "pty-1")],
        }),
        project({
          name: "other",
          statusEntries: [entry("claude_code_a", STATUS_DONE, "pty-1")],
        }),
      ],
    });
    expect(fleet.rows.every((r) => r.dismissable)).toBe(true);
  });

  it("never dismisses Waiting, even alone on its terminal", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "app",
          statusEntries: [entry("claude_code_a", STATUS_WAITING, "pty-1")],
        }),
      ],
    });
    expect(fleet.rows[0].dismissable).toBe(false);
  });

  it("never dismisses a working agent or an automation", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "app",
          statusEntries: [entry("claude_code_a", STATUS_RUNNING, "pty-1")],
        }),
      ],
      jobs: [job({ id: "nightly", running: true, project: "app", targets: ["app"] })],
    });
    expect(fleet.rows.every((r) => r.dismissable)).toBe(false);
    const byKind = new Map(fleet.rows.map((r) => [r.kind, r.dismissBlocked]));
    expect(byKind.get("agent")).toBe(
      "The agent is still working — this clears when it finishes.",
    );
    expect(byKind.get("automation")).toBe(
      "This automation clears itself when the run finishes.",
    );
  });

  it("says an approval clears by answering it", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "app",
          statusEntries: [entry("claude_code_a", STATUS_WAITING, "pty-1")],
        }),
      ],
    });
    expect(fleet.rows[0].dismissBlocked).toBe(
      "The agent is asking for you — answering it is what clears this.",
    );
  });

  it("gives a reason for every blocked row and none for the rest", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "app",
          statusEntries: [
            entry("claude_code_a", STATUS_DONE, "pty-1"),
            entry("claude_code_b", STATUS_ERROR, "pty-2"),
            entry("claude_code_c", STATUS_WAITING, "pty-3"),
            entry("claude_code_d", "Compacting", "pty-4"),
          ],
        }),
      ],
    });
    for (const row of fleet.rows) {
      expect(row.dismissable).toBe(row.dismissBlocked === null);
    }
  });

  it("cannot dismiss a row that reported no terminal", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "app",
          statusEntries: [entry("claude_code_a", STATUS_DONE, "")],
        }),
      ],
    });
    expect(fleet.rows[0].terminalId).toBeNull();
    expect(fleet.rows[0].dismissable).toBe(false);
    expect(fleet.rows[0].dismissBlocked).toContain("open terminal");
  });
});

describe("project identity", () => {
  const parent = project({ name: "lpm", label: "My App" });

  it("inherits a copy's name from its parent", () => {
    const fleet = build({
      now: T0,
      projects: [
        parent,
        project({
          name: "lpm-2",
          parentName: "lpm",
          statusEntries: [entry("claude_code_a", STATUS_RUNNING)],
        }),
      ],
    });
    expect(fleet.rows[0].project).toMatchObject({
      name: "lpm-2",
      label: "My App-2",
      isCopy: true,
      isWorktree: false,
      isRemote: false,
      peerAlias: null,
    });
  });

  it("marks a worktree as a worktree and not a copy", () => {
    const fleet = build({
      now: T0,
      projects: [
        parent,
        project({
          name: "lpm-fix",
          parentName: "lpm",
          worktree: true,
          statusEntries: [entry("claude_code_a", STATUS_RUNNING)],
        }),
      ],
    });
    expect(fleet.rows[0].project).toMatchObject({
      isCopy: false,
      isWorktree: true,
    });
  });

  it("marks an SSH project as remote", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "server",
          isRemote: true,
          statusEntries: [entry("claude_code_a", STATUS_RUNNING)],
        }),
      ],
    });
    expect(fleet.rows[0].project.isRemote).toBe(true);
  });

  it("names the paired Mac a peer project is hosted on", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "peer-abcdef12-app",
          label: "app",
          statusEntries: [entry("claude_code_a", STATUS_RUNNING)],
        }),
      ],
      peerAliases: { abcdef12: "Studio Mac" },
    });
    expect(fleet.rows[0].project).toMatchObject({
      name: "peer-abcdef12-app",
      label: "app",
      peerAlias: "Studio Mac",
    });
  });

  it("leaves the paired Mac unnamed when the caller supplied no name for it", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "peer-00112233-app",
          label: "app",
          statusEntries: [entry("claude_code_a", STATUS_RUNNING)],
        }),
      ],
    });
    expect(fleet.rows[0].project.peerAlias).toBeNull();
  });
});

describe("titles", () => {
  it("names the agent from the status key", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "app",
          statusEntries: [
            entry("claude_code_a", STATUS_WAITING, "pty-1"),
            entry("codex_b", STATUS_WAITING, "pty-2"),
            entry("something_else", STATUS_WAITING, "pty-3"),
          ],
        }),
      ],
    });
    const byId = new Map(fleet.rows.map((r) => [r.id, r.title]));
    expect(byId.get("agent:app:claude_code_a")).toBe("Claude Code");
    expect(byId.get("agent:app:codex_b")).toBe("Codex");
    expect(byId.get("agent:app:something_else")).toBe("Agent");
  });

  it("titles an automation with its own name", () => {
    const fleet = build({
      now: T0,
      projects: [project({ name: "app" })],
      jobs: [
        job({
          id: "sweep",
          label: "Sweep",
          agent: "codex",
          running: true,
          project: "app",
          targets: ["app"],
        }),
      ],
    });
    expect(fleet.rows[0]).toMatchObject({
      kind: "automation",
      title: "Sweep",
      jobId: "sweep",
      state: "working",
    });
  });
});

describe("automations", () => {
  it("lists only running jobs and uses the true start time", () => {
    const fleet = build({
      now: T0,
      projects: [project({ name: "app" })],
      jobs: [
        job({ id: "idle-job", running: false, project: "app", targets: ["app"] }),
        job({
          id: "live",
          running: true,
          runningSince: Math.floor(T0 / 1000) - 300,
          project: "app",
          targets: ["app"],
        }),
      ],
    });
    expect(ids(fleet.rows)).toEqual(["automation:app:live"]);
    expect(fleet.rows[0].stateSince).toBe(T0 - 300_000);
    expect(fleetElapsedLabel(fleet.rows[0], T0)).toBe("working 5m");
  });

  it("headlines the stamped project of a job that carries no targets", () => {
    const fleet = build({
      now: T0,
      projects: [project({ name: "app", label: "Checkout" })],
      jobs: [job({ id: "repo-job", running: true, project: "app" })],
    });
    expect(fleet.rows[0].project).toMatchObject({ name: "app", label: "Checkout" });
    expect(fleet.quietProjectCount).toBe(0);
  });

  it("labels a standalone job as belonging to no project", () => {
    const fleet = build({
      now: T0,
      projects: [project({ name: "app" })],
      jobs: [job({ id: "chores", label: "Chores", running: true, standalone: true })],
    });
    expect(fleet.rows[0].project).toMatchObject({ name: "", label: "No project" });
  });

  it("summarises a shared job spanning several projects", () => {
    const fleet = build({
      now: T0,
      projects: [project({ name: "app" }), project({ name: "site" })],
      jobs: [
        job({
          id: "shared",
          label: "Shared",
          running: true,
          targets: ["app", "site"],
          targetCount: 2,
          runningCount: 1,
        }),
      ],
    });
    expect(fleet.rows[0].detail).toBe("Running in 1 of 2 projects");
  });

  it("never headlines one target of a job that spans several", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({ name: "app", label: "Checkout" }),
        project({ name: "site", label: "Marketing" }),
        project({ name: "docs", label: "Docs" }),
      ],
      jobs: [
        job({
          id: "shared",
          label: "Shared",
          running: true,
          project: "app",
          targets: ["app", "site", "docs"],
          targetCount: 3,
          runningCount: 2,
        }),
      ],
    });
    expect(fleet.rows[0].project).toMatchObject({
      name: "",
      label: "Multiple projects",
    });
    expect(fleet.rows[0].detail).toBe("Running in 2 of 3 projects");
  });

  it("counts none of a shared job's projects as quiet", () => {
    const fleet = build({
      now: T0,
      projects: [project({ name: "app" }), project({ name: "site" })],
      jobs: [
        job({
          id: "shared",
          running: true,
          targets: ["app", "site"],
          targetCount: 2,
        }),
      ],
    });
    expect(fleet.quietProjectCount).toBe(0);
  });

  it("still headlines the project of a job with a single target", () => {
    const fleet = build({
      now: T0,
      projects: [project({ name: "app", label: "Checkout" })],
      jobs: [
        job({
          id: "solo",
          running: true,
          targets: ["app"],
          targetCount: 1,
        }),
      ],
    });
    expect(fleet.rows[0].project).toMatchObject({ name: "app", label: "Checkout" });
    expect(fleet.rows[0].detail).toBeNull();
  });

  it("flags that a paired Mac's automations cannot be listed", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({ name: "app" }),
        project({ name: "peer-abcdef12-app", label: "app" }),
      ],
      peerAliases: { abcdef12: "Studio Mac" },
    });
    expect(fleet.peerAutomationsHidden).toBe(true);
    expect(fleet.peerAutomationMacs).toEqual(["Studio Mac"]);
  });

  it("does not flag anything when every project is local", () => {
    const fleet = build({ now: T0, projects: [project({ name: "app" })] });
    expect(fleet.peerAutomationsHidden).toBe(false);
    expect(fleet.peerAutomationMacs).toEqual([]);
  });
});

describe("tab titles", () => {
  const titled = (title: string) =>
    build({
      now: T0,
      terminalTitles: { app: { "pty-1": title } },
      projects: [
        project({
          name: "app",
          statusEntries: [entry("claude_code_a", "Running", "pty-1")],
        }),
      ],
    });

  it("names the row after the tab the agent is running in", () => {
    expect(titled("Fix terminal links").rows[0].tabTitle).toBe(
      "Fix terminal links",
    );
  });

  it("drops a tab title that only repeats the agent's name", () => {
    expect(titled("Claude Code").rows[0].tabTitle).toBeNull();
  });

  it("leaves a row with no open tab untitled", () => {
    const fleet = build({
      now: T0,
      terminalTitles: { other: { "pty-1": "Somewhere else" } },
      projects: [
        project({
          name: "app",
          statusEntries: [entry("claude_code_a", "Running", "pty-1")],
        }),
      ],
    });
    expect(fleet.rows[0].tabTitle).toBeNull();
  });
});

describe("services", () => {
  it("splits running services from declared-but-not-started ones", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "app",
          label: "My App",
          running: true,
          services: [service("web")],
          allServices: [service("web"), service("api"), service("worker")],
        }),
      ],
    });
    expect(fleet.services).toEqual([
      {
        project: expect.objectContaining({ name: "app", label: "My App" }),
        running: ["web"],
        declared: ["api", "worker"],
        ports: {},
        chips: [
          { kind: "service", name: "web", running: true },
          { kind: "service", name: "api", running: false },
          { kind: "service", name: "worker", running: false },
        ],
      },
    ]);
  });

  it("offers a chip per profile, then the services no profile covers", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "app",
          running: true,
          services: [service("web"), service("api")],
          allServices: [service("web"), service("api"), service("docs")],
          profiles: [
            { name: "full", services: ["web", "api"] },
            { name: "api-only", services: ["api"] },
          ],
          activeProfile: "full",
        }),
      ],
    });
    expect(fleet.services[0].chips).toEqual([
      { kind: "profile", name: "full", running: true },
      { kind: "profile", name: "api-only", running: false },
      { kind: "service", name: "docs", running: false },
    ]);
  });

  it("lights no profile when the running set matches none of them", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "app",
          running: true,
          services: [service("docs")],
          allServices: [service("web"), service("docs")],
          profiles: [{ name: "full", services: ["web"] }],
          activeProfile: "",
        }),
      ],
    });
    expect(fleet.services[0].chips).toEqual([
      { kind: "profile", name: "full", running: false },
      { kind: "service", name: "docs", running: true },
    ]);
  });

  it("carries the port each service declares", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "app",
          running: true,
          services: [{ ...service("web"), port: 5173 }],
          allServices: [{ ...service("web"), port: 5173 }, service("api")],
        }),
      ],
    });
    expect(fleet.services[0].ports).toEqual({ web: 5173 });
  });

  it("ignores a project that is not running", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "app",
          running: false,
          allServices: [service("web")],
        }),
      ],
    });
    expect(fleet.services).toEqual([]);
  });
});

describe("counts and quiet projects", () => {
  it("counts every state and excludes empty projects from the rows", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "app",
          statusEntries: [
            entry("claude_code_w", STATUS_WAITING, "pty-1"),
            entry("claude_code_e", STATUS_ERROR, "pty-2"),
            entry("claude_code_r", STATUS_RUNNING, "pty-3"),
            entry("claude_code_d", STATUS_DONE, "pty-4"),
          ],
        }),
        project({ name: "quiet-one" }),
        project({ name: "quiet-two" }),
      ],
    });
    expect(fleet.counts).toEqual({ needsYou: 1, error: 1, working: 1, done: 1 });
    expect(fleet.rows.every((r) => r.project.name === "app")).toBe(true);
    expect(fleet.quietProjectCount).toBe(2);
  });

  it("does not count a project with running services as quiet", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({ name: "app", running: true, services: [service("web")] }),
      ],
    });
    expect(fleet.rows).toEqual([]);
    expect(fleet.quietProjectCount).toBe(0);
  });

  it("keeps the counts whole when a filter narrows the rows", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "app",
          statusEntries: [entry("claude_code_w", STATUS_WAITING, "pty-1")],
        }),
      ],
      filter: { kind: "services" },
    });
    expect(fleet.rows).toEqual([]);
    expect(fleet.counts.needsYou).toBe(1);
  });
});

// The filter itself is covered in fleetFilter.test.ts; this is the wiring.
describe("filtering", () => {
  const snapshot = {
    now: T0,
    projects: [
      project({
        name: "app",
        label: "Checkout",
        running: true,
        services: [service("stripe-mock")],
        allServices: [service("stripe-mock")],
        statusEntries: [entry("codex_a", STATUS_WAITING, "pty-1")],
      }),
      project({
        name: "site",
        label: "Marketing",
        statusEntries: [entry("claude_code_b", STATUS_WAITING, "pty-2")],
      }),
    ],
    jobs: [
      job({
        id: "sweep",
        label: "Dependency sweep",
        running: true,
        project: "site",
        targets: ["site"],
      }),
    ],
  };

  it("returns everything with no filter", () => {
    const fleet = build(snapshot);
    expect(fleet.rows).toHaveLength(3);
    expect(fleet.services).toHaveLength(1);
  });

  it("passes the query through to rows and services", () => {
    const fleet = build({ ...snapshot, filter: { query: "market" } });
    expect(fleet.rows.map((r) => r.project.name)).toEqual(["site", "site"]);
    expect(fleet.services).toEqual([]);
  });

  it("passes the kind through", () => {
    const fleet = build({ ...snapshot, filter: { kind: "automations" } });
    expect(ids(fleet.rows)).toEqual(["automation:site:sweep"]);
    expect(fleet.services).toEqual([]);
  });
});

describe("elapsed copy", () => {
  it("says waiting and working, never running, for an agent", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "app",
          statusEntries: [
            entry("claude_code_w", STATUS_WAITING, "pty-1"),
            entry("claude_code_r", STATUS_RUNNING, "pty-2"),
          ],
        }),
      ],
    });
    const later = T0 + 4 * 60_000;
    expect(fleetElapsedLabel(fleet.rows[0], later)).toBe("waiting 4m");
    expect(fleetElapsedLabel(fleet.rows[1], later)).toBe("working 4m");
  });

  it("says working, never running, for an automation too", () => {
    const fleet = build({
      now: T0,
      projects: [project({ name: "app" })],
      jobs: [
        job({
          id: "sweep",
          running: true,
          runningSince: Math.floor(T0 / 1000) - 480,
          targets: ["app"],
        }),
      ],
    });
    expect(fleetElapsedLabel(fleet.rows[0], T0)).toBe("working 8m");
  });

  it("clamps at zero when a paired Mac's clock runs ahead", () => {
    const fleet = build({
      now: T0,
      projects: [
        project({
          name: "peer-abcdef12-app",
          label: "app",
          statusEntries: [
            entry("claude_code_w", STATUS_WAITING, "pty-1", T0 + 90_000),
          ],
        }),
      ],
    });
    expect(fleetElapsedLabel(fleet.rows[0], T0)).toBe("waiting 0s");
  });
});
