import { describe, it, expect, vi } from "vitest";
import { prefixName } from "./markers";

// A controllable Tauri runtime: `invoke("peer_state")` returns the current
// state; `listen` records handlers so the test can drive `peer-state-changed`
// and `peer-evt-*` deliveries.
const h = vi.hoisted(() => ({
  listeners: [] as { name: string; cb: (e: { payload: unknown }) => void }[],
  state: { current: { peers: [{ slug: "aaaaaaaa", connected: false }] } as unknown },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => (cmd === "peer_state" ? h.state.current : null)),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, cb: (e: { payload: unknown }) => void) => {
    h.listeners.push({ name, cb });
    return () => {
      const i = h.listeners.findIndex((l) => l.name === name && l.cb === cb);
      if (i >= 0) h.listeners.splice(i, 1);
    };
  }),
}));

// route.ts is a no-op outside a browser; give it a window.
vi.stubGlobal("window", {});

function emit(name: string, payload: unknown) {
  for (const l of h.listeners.filter((l) => l.name === name)) l.cb({ payload });
}
const flush = () => new Promise((r) => setTimeout(r, 0));

const { subscribePeerGlobalEvent, routedInvoke } = await import("./route");
const invokeMock = vi.mocked((await import("@tauri-apps/api/core")).invoke);

describe("subscribePeerGlobalEvent connect sequence (M1 regression)", () => {
  it("taps a peer only after it connects, then delivers translated payloads", async () => {
    const received: unknown[] = [];
    const off = subscribePeerGlobalEvent("status-changed", (p) => received.push(p));
    await flush();

    // Peer present but not connected → no wrapper tap yet.
    expect(h.listeners.some((l) => l.name === "peer-evt-aaaaaaaa")).toBe(false);

    // Peer connects: reconcile must see the FRESH state and attach the tap.
    h.state.current = { peers: [{ slug: "aaaaaaaa", connected: true }] };
    emit("peer-state-changed", null);
    await flush();
    expect(h.listeners.some((l) => l.name === "peer-evt-aaaaaaaa")).toBe(true);

    // A forwarded status-changed is translated (name prefixed) and delivered.
    emit("peer-evt-aaaaaaaa", { name: "status-changed", payload: "proj" });
    expect(received).toEqual([prefixName("aaaaaaaa", "proj")]);

    // A different event name on the same stream is ignored by this subscriber.
    emit("peer-evt-aaaaaaaa", { name: "ports-changed", payload: "proj" });
    expect(received).toEqual([prefixName("aaaaaaaa", "proj")]);

    // Disconnect drops the tap.
    h.state.current = { peers: [{ slug: "aaaaaaaa", connected: false }] };
    emit("peer-state-changed", null);
    await flush();
    expect(h.listeners.some((l) => l.name === "peer-evt-aaaaaaaa")).toBe(false);

    off();
  });
});

// Exactly one side subscribes a peer terminal: the pane that renders it, on
// mount, because only it knows whether its emulator may resume. Subscribing the
// id here as well made every remote terminal open with two full replays.
describe("start_terminal", () => {
  it("prefixes the new terminal id without subscribing it", async () => {
    invokeMock.mockClear();
    const id = await routedInvoke("start_terminal", { name: prefixName("aaaaaaaa", "proj") });

    expect(typeof id).toBe("string");
    expect(String(id).startsWith(prefixName("aaaaaaaa", ""))).toBe(true);
    expect(invokeMock.mock.calls.some(([cmd]) => cmd === "peer_term_attach")).toBe(false);
  });
});

// Whatever is decided by what an agent does has to know when that isn't known.
describe("a computer that stops answering", () => {
  it("keeps its projects listed, marked as unknown, and drops statuses that got old", async () => {
    vi.useFakeTimers();
    const running = { key: "claude", value: "Running", priority: 0, timestamp: 1, paneID: "t1" };
    let answers = true;
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "peer_state") return h.state.current;
      if (cmd !== "peer_invoke") return [];
      return answers ? [{ name: "demo", root: "/r", statusEntries: [running] }] : new Promise(() => {});
    });
    h.state.current = { peers: [{ slug: "aaaaaaaa", connected: true }] };
    emit("peer-state-changed", null);
    const list = async () => {
      const listed = routedInvoke("list_projects") as Promise<{ statusEntries: unknown[]; statusUnknown?: boolean }[]>;
      await vi.advanceTimersByTimeAsync(5_000);
      return (await listed)[0];
    };

    expect(await list()).toMatchObject({ statusEntries: [{ value: "Running" }] });
    expect((await list()).statusUnknown).toBeUndefined();

    answers = false;
    expect(await list()).toMatchObject({ statusEntries: [{ value: "Running" }], statusUnknown: true });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await list()).toMatchObject({ statusEntries: [], statusUnknown: true });
    vi.useRealTimers();
  });
});
