import { describe, expect, it } from "vitest";
import { applyFleetFilter } from "./fleetFilter";
import type {
  FleetChip,
  FleetRow,
  FleetRowKind,
  FleetServiceGroup,
} from "./fleetRows";

const T0 = 1_700_000_000_000;

function identity(name: string, label: string) {
  return {
    name,
    label,
    isCopy: false,
    isWorktree: false,
    isRemote: false,
    peerAlias: null,
  };
}

function row(
  id: string,
  kind: FleetRowKind,
  projectLabel: string,
  title: string,
): FleetRow {
  return {
    id,
    kind,
    project: identity(id.split(":")[1] ?? "app", projectLabel),
    title,
    tabTitle: null,
    shared: 0,
    holdsError: false,
    state: "working",
    statusKey: kind === "agent" ? id : null,
    statusValue: kind === "agent" ? "Running" : null,
    terminalId: kind === "agent" ? "pty-1" : null,
    jobId: kind === "automation" ? id : null,
    stateSince: T0,
    detail: null,
    dismissable: false,
    dismissBlocked: null,
  };
}

function group(
  label: string,
  running: string[],
  declared: string[] = [],
  chips: FleetChip[] = [],
): FleetServiceGroup {
  return {
    project: identity(label.toLowerCase(), label),
    running,
    declared,
    ports: {},
    chips,
  };
}

function chip(name: string, running = false): FleetChip {
  return { kind: "service", name, running };
}

const rows = [
  row("agent:app:codex_a", "agent", "Checkout", "Codex"),
  row("agent:site:claude_code_b", "agent", "Marketing", "Claude Code"),
  row("automation:site:sweep", "automation", "Marketing", "Dependency sweep"),
];
const services = [
  group("Checkout", ["stripe-mock"], ["api"], [
    chip("stripe-mock", true),
    chip("api"),
  ]),
];
const ids = (list: FleetRow[]) => list.map((r) => r.id);

describe("applyFleetFilter", () => {
  it("returns everything untouched with no filter", () => {
    const visible = applyFleetFilter(rows, services, undefined);
    expect(visible.rows).toEqual(rows);
    expect(visible.services).toEqual(services);
  });

  it("matches a project label", () => {
    const visible = applyFleetFilter(rows, services, { query: "market" });
    expect(ids(visible.rows)).toEqual([
      "agent:site:claude_code_b",
      "automation:site:sweep",
    ]);
    expect(visible.services).toEqual([]);
  });

  it("matches a row title", () => {
    const visible = applyFleetFilter(rows, services, { query: "dependency" });
    expect(ids(visible.rows)).toEqual(["automation:site:sweep"]);
  });

  it("ignores case and surrounding space in the query", () => {
    const visible = applyFleetFilter(rows, services, { query: "  CODEX " });
    expect(ids(visible.rows)).toEqual(["agent:app:codex_a"]);
  });

  it("matches a service name and keeps only the services that hit", () => {
    const visible = applyFleetFilter(rows, services, { query: "stripe" });
    expect(visible.rows).toEqual([]);
    expect(visible.services).toEqual([
      {
        project: expect.objectContaining({ label: "Checkout" }),
        running: ["stripe-mock"],
        declared: [],
        ports: {},
        chips: [chip("stripe-mock", true)],
      },
    ]);
  });

  it("keeps a profile whose name matches even when no service does", () => {
    const withProfile = [
      group("Checkout", ["stripe-mock"], ["api"], [
        { kind: "profile", name: "payments", running: true },
        chip("api"),
      ]),
    ];
    const visible = applyFleetFilter([], withProfile, { query: "payments" });
    expect(visible.services).toEqual([
      expect.objectContaining({
        running: [],
        declared: [],
        chips: [{ kind: "profile", name: "payments", running: true }],
      }),
    ]);
  });

  it("keeps every service of a group whose project matches", () => {
    const visible = applyFleetFilter(rows, services, { query: "checkout" });
    expect(visible.services).toEqual(services);
  });

  it("drops a group with no matching service", () => {
    const visible = applyFleetFilter([], services, { query: "worker" });
    expect(visible.services).toEqual([]);
  });

  it("narrows to agents, automations or services by kind", () => {
    const agents = applyFleetFilter(rows, services, { kind: "agents" });
    expect(agents.rows.every((r) => r.kind === "agent")).toBe(true);
    expect(agents.services).toEqual([]);

    const automations = applyFleetFilter(rows, services, { kind: "automations" });
    expect(ids(automations.rows)).toEqual(["automation:site:sweep"]);
    expect(automations.services).toEqual([]);

    const onlyServices = applyFleetFilter(rows, services, { kind: "services" });
    expect(onlyServices.rows).toEqual([]);
    expect(onlyServices.services).toEqual(services);
  });

  it("applies the kind and the query together", () => {
    const visible = applyFleetFilter(rows, services, {
      kind: "agents",
      query: "marketing",
    });
    expect(ids(visible.rows)).toEqual(["agent:site:claude_code_b"]);
  });

  it("narrows to one status and drops the services with it", () => {
    const waiting = { ...rows[0], id: "agent:app:codex_c", state: "needs-you" as const };
    const visible = applyFleetFilter([...rows, waiting], services, {
      state: "needs-you",
    });
    expect(ids(visible.rows)).toEqual(["agent:app:codex_c"]);
    expect(visible.services).toEqual([]);
  });

  it("applies the status, the kind and the query together", () => {
    const visible = applyFleetFilter(rows, services, {
      state: "working",
      kind: "agents",
      query: "marketing",
    });
    expect(ids(visible.rows)).toEqual(["agent:site:claude_code_b"]);
  });

  it("does not mutate its inputs", () => {
    applyFleetFilter(rows, services, { kind: "agents", query: "market" });
    expect(rows).toHaveLength(3);
    expect(services[0].running).toEqual(["stripe-mock"]);
  });
});
