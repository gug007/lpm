import { describe, it, expect, vi } from "vitest";
import { prefixName } from "./markers";

// The peer registry as list_projects sees it at page load. `peer_state` runs on the
// main thread while list_projects runs off it, so the listing can land first — the
// ordering this file pins down. Its own file (rather than route.test.ts) because
// the registry loads once per module instance and these cases are about that load.
const h = vi.hoisted(() => ({
  peerStateCalls: 0,
  // Fail the Nth peer_state call (1-based); 0 fails none.
  failCall: 0,
  // Resolve peer_state a macrotask late, after an immediate list_projects.
  slow: true,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "peer_state") {
      h.peerStateCalls += 1;
      if (h.slow) await new Promise((r) => setTimeout(r, 20));
      if (h.peerStateCalls === h.failCall) throw new Error("peer server starting");
      return { peers: [{ slug: "aaaaaaaa", connected: true }] };
    }
    if (cmd === "list_projects") return [{ name: "local", root: "/local" }];
    if (cmd === "peer_invoke") return [{ name: "demo", root: "/srv/demo" }];
    return null;
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

vi.stubGlobal("window", {});

const { routedInvoke } = await import("./route");

const names = (list: unknown) => (list as { name: string }[]).map((p) => p.name);

describe("list_projects at page load", () => {
  it("waits for the peer registry instead of listing local projects alone", async () => {
    const list = await routedInvoke("list_projects");

    expect(names(list)).toEqual(["local", prefixName("aaaaaaaa", "demo")]);
  });

  it("retries a registry load that failed rather than latching an empty one", async () => {
    vi.resetModules();
    h.peerStateCalls = 0;
    h.failCall = 1;
    const { routedInvoke: freshInvoke } = await import("./route");

    // First listing loses the peer: peer_state failed, and a peer whose connection
    // never changes emits no event that would re-run it.
    expect(names(await freshInvoke("list_projects"))).toEqual(["local"]);

    // The next listing must try again — nothing else will.
    expect(names(await freshInvoke("list_projects"))).toEqual([
      "local",
      prefixName("aaaaaaaa", "demo"),
    ]);
  });
});
