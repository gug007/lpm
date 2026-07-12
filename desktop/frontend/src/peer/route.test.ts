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

const { subscribePeerGlobalEvent } = await import("./route");

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
