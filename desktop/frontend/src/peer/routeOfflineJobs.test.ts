import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prefixName } from "./markers";

// A server whose automations were listed, then stopped answering, then dropped
// off. Its own file: the route module keeps per-peer state.
const h = vi.hoisted(() => ({
  connected: true,
  answers: true,
  fails: false,
  stateChanged: null as null | (() => void),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "peer_state") return { peers: [{ slug: "aaaaaaaa", connected: h.connected }] };
    if (cmd === "list_all_jobs") return [];
    if (cmd === "peer_invoke") {
      if (h.fails) throw new Error("peer not connected");
      if (!h.answers) return new Promise(() => {});
      return [{ id: "triage", project: "shop", valid: true, enabled: true, running: true }];
    }
    return null;
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, cb: () => void) => {
    if (name === "peer-state-changed") h.stateChanged = cb;
    return () => {};
  }),
}));

vi.stubGlobal("window", {});

type Row = { id: string; project: string; offline?: boolean; running?: boolean };

let routedInvoke: (cmd: string) => Promise<unknown>;

async function list(): Promise<Row[]> {
  const pending = routedInvoke("list_all_jobs") as Promise<Row[]>;
  await vi.advanceTimersByTimeAsync(5_000);
  return pending;
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  h.connected = true;
  h.answers = true;
  h.fails = false;
  ({ routedInvoke } = await import("./route"));
});
afterEach(() => vi.useRealTimers());

describe("list_all_jobs with a server that drops off", () => {
  it("keeps the server's automations instead of listing none, marked offline once it's gone", async () => {
    const live = await list();
    expect(live).toEqual([
      expect.objectContaining({ id: "triage", project: prefixName("aaaaaaaa", "shop"), running: true }),
    ]);
    expect(live[0].offline).toBeUndefined();

    h.answers = false;
    const silent = await list();
    expect(silent).toEqual([expect.objectContaining({ id: "triage", project: prefixName("aaaaaaaa", "shop") })]);
    expect(silent[0].offline).toBeUndefined();

    h.connected = false;
    h.stateChanged?.();
    await vi.advanceTimersByTimeAsync(0);
    const gone = await list();
    expect(gone).toEqual([expect.objectContaining({ id: "triage", offline: true, running: false })]);

    h.connected = true;
    h.answers = true;
    h.stateChanged?.();
    await vi.advanceTimersByTimeAsync(0);
    const back = await list();
    expect(back[0].offline).toBeUndefined();
  });

  it("marks them offline when the call fails before the drop reaches the peer list", async () => {
    await list();
    h.fails = true;
    const dropped = await list();
    expect(dropped).toEqual([expect.objectContaining({ id: "triage", offline: true, running: false })]);
  });
});
