import { describe, expect, it } from "vitest";
import type { KeepAwakeState } from "./keepAwake";
import { firstPick, keepAwakeMachines, type KeepAwakeReading } from "./keepAwakeMachines";

const state = (patch: Partial<KeepAwakeState>): KeepAwakeState => ({
  supported: true,
  screenSupported: true,
  mode: "off",
  active: false,
  agents: 0,
  endsIn: null,
  tailMinutes: 5,
  screen: false,
  battery: true,
  floor: 20,
  power: "idle",
  ...patch,
});
const reading = (patch: Partial<KeepAwakeState>): KeepAwakeReading => ({ state: state(patch), endsAt: null });
const PEERS = [
  { slug: "mini", name: "Mac mini" },
  { slug: "server", name: "dev-server" },
  { slug: "old", name: "Old Mac" },
];

describe("keepAwakeMachines", () => {
  it("lists this machine, then each connected one that can be kept awake", () => {
    const machines = keepAwakeMachines(reading({}), "This Mac", PEERS, {
      mini: reading({ mode: "timed", active: true }),
      server: reading({ supported: false }),
    });
    expect(machines.map((m) => m.name)).toEqual(["This Mac", "Mac mini"]);
  });

  it("keeps this machine while it loads, and drops it when it can't be kept awake", () => {
    expect(keepAwakeMachines(null, "This Mac", [], {}).map((m) => m.slug)).toEqual([null]);
    expect(keepAwakeMachines(reading({ supported: false }), "This Mac", PEERS, { mini: reading({}) }).map((m) => m.slug)).toEqual([
      "mini",
    ]);
  });
});

describe("firstPick", () => {
  it("opens on this machine while it's on, else the first connected one that is", () => {
    const peers = { mini: reading({ mode: "always", active: true }) };
    expect(firstPick(keepAwakeMachines(reading({ mode: "agents" }), "This Mac", PEERS, peers))).toBeNull();
    expect(firstPick(keepAwakeMachines(reading({}), "This Mac", PEERS, peers))).toBe("mini");
    expect(firstPick(keepAwakeMachines(reading({}), "This Mac", PEERS, { mini: reading({}) }))).toBeNull();
    expect(firstPick(keepAwakeMachines(reading({ supported: false }), "This Mac", PEERS, { mini: reading({}) }))).toBe("mini");
  });
});
