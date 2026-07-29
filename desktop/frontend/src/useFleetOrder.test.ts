import { describe, expect, it } from "vitest";
import { applyFrozenOrder, fleetOrderIsStale } from "./useFleetOrder";
import type { FleetRow } from "./fleetRows";
import type { AgentState } from "./agentStatus";

const T0 = 1_700_000_000_000;

function row(id: string, state: AgentState, stateSince = T0): FleetRow {
  return {
    id,
    kind: "agent",
    project: {
      name: "app",
      label: "App",
      isCopy: false,
      isWorktree: false,
      isRemote: false,
      peerAlias: null,
    },
    title: "Claude Code",
    state,
    statusKey: id,
    statusValue: "Running",
    terminalId: "pty-1",
    jobId: null,
    stateSince,
    detail: null,
    dismissable: false,
    dismissBlocked: null,
  };
}

const ids = (rows: FleetRow[]) => rows.map((r) => r.id);
const ranks = (order: string[]) => new Map(order.map((id, i) => [id, i]));

describe("applyFrozenOrder", () => {
  it("keeps held positions when a row's state becomes more urgent", () => {
    const rows = [row("c", "needs-you"), row("a", "working"), row("b", "done")];
    expect(ids(applyFrozenOrder(rows, ranks(["a", "b", "c"])))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("drops rows that went away without moving the rest", () => {
    const rows = [row("c", "idle"), row("a", "working")];
    expect(ids(applyFrozenOrder(rows, ranks(["a", "b", "c"])))).toEqual([
      "a",
      "c",
    ]);
  });

  it("appends rows the held order never saw, in attention order", () => {
    const rows = [
      row("a", "done"),
      row("z", "working", T0 - 5000),
      row("y", "needs-you", T0),
    ];
    expect(ids(applyFrozenOrder(rows, ranks(["a"])))).toEqual(["a", "y", "z"]);
  });

  it("does not mutate the input", () => {
    const rows = [row("b", "done"), row("a", "working")];
    applyFrozenOrder(rows, ranks(["a", "b"]));
    expect(ids(rows)).toEqual(["b", "a"]);
  });
});

describe("fleetOrderIsStale", () => {
  it("is quiet about a list already in attention order", () => {
    const rows = [row("a", "needs-you"), row("b", "working"), row("c", "done")];
    expect(fleetOrderIsStale(rows)).toBe(false);
  });

  it("spots an approval pinned below a done row", () => {
    const rows = [row("a", "done"), row("b", "needs-you")];
    expect(fleetOrderIsStale(rows)).toBe(true);
  });

  it("spots a longer wait pinned below a shorter one in the same state", () => {
    const rows = [row("a", "needs-you", T0), row("b", "needs-you", T0 - 60_000)];
    expect(fleetOrderIsStale(rows)).toBe(true);
  });

  it("is quiet about an empty or single-row list", () => {
    expect(fleetOrderIsStale([])).toBe(false);
    expect(fleetOrderIsStale([row("a", "done")])).toBe(false);
  });
});
