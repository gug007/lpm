import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prefixName } from "./markers";

// A paired Mac that stops answering (asleep, off the network) while still
// counted as connected. Its own file: the route module keeps per-peer state.
const h = vi.hoisted(() => ({ peerAnswers: true }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "peer_state") return { peers: [{ slug: "aaaaaaaa", connected: true }] };
    if (cmd === "list_projects") {
      return [{ name: "local", root: "/local", statusEntries: [{ key: "k", value: "Done" }] }];
    }
    if (cmd === "peer_invoke") {
      if (!h.peerAnswers) return new Promise(() => {});
      return [{ name: "demo", root: "/srv/demo", statusEntries: [{ key: "r", value: "Running" }] }];
    }
    return null;
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

vi.stubGlobal("window", {});

type Listed = { name: string; statusEntries: { value: string }[] }[];

let routedInvoke: (cmd: string) => Promise<unknown>;

async function list(): Promise<Listed> {
  const pending = routedInvoke("list_projects") as Promise<Listed>;
  await vi.advanceTimersByTimeAsync(5_000);
  return pending;
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  ({ routedInvoke } = await import("./route"));
});
afterEach(() => vi.useRealTimers());

describe("list_projects with a paired Mac that stopped answering", () => {
  it("lists this Mac's projects on time, and the peer's last statuses only while recent", async () => {
    h.peerAnswers = true;
    expect((await list()).map((p) => p.name)).toEqual(["local", prefixName("aaaaaaaa", "demo")]);

    h.peerAnswers = false;
    const started = Date.now();
    const recent = await list();
    expect(Date.now() - started).toBeLessThanOrEqual(5_000);
    expect(recent[0].statusEntries[0].value).toBe("Done");
    expect(recent[1].statusEntries.map((e) => e.value)).toEqual(["Running"]);

    await vi.advanceTimersByTimeAsync(15_000);
    const stale = await list();
    expect(stale.map((p) => p.name)).toEqual(["local", prefixName("aaaaaaaa", "demo")]);
    expect(stale[1].statusEntries).toEqual([]);
  });

  it("does not make every listing wait on a call the peer is still not answering", async () => {
    h.peerAnswers = false;
    await list();
    let settled = false;
    const next = (routedInvoke("list_projects") as Promise<Listed>).then((l) => {
      settled = true;
      return l;
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(settled).toBe(true);
    expect((await next)[0].name).toBe("local");
  });
});
