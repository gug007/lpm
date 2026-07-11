import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock hoists above any const, so the factories are inlined. `then` must
// stay undefined: a function there makes the mocked module thenable and vitest
// awaits it forever.
vi.mock("../../bridge/commands", () =>
  new Proxy({}, {
    has: () => true,
    get: (_t, prop) => (prop === "then" ? undefined : vi.fn()),
  }));
vi.mock("../../bridge/runtime", () =>
  new Proxy({}, {
    has: () => true,
    get: (_t, prop) => (prop === "then" ? undefined : vi.fn()),
  }));

import { useAppStore } from "./app";
import type { SpawnTask } from "../types";

const cmd = (command: string): SpawnTask => ({ kind: "command", command });

// The consumer (ProjectDetail) latches the last-consumed nonce in a ref that
// lives as long as the mounted detail, and consuming clears the store entry. A
// per-mount boolean latch dropped every queue after the first for an already-open
// project; the nonce lets a repeat `run` re-fire. These assert the store half.
describe("spawnTasks queue", () => {
  beforeEach(() => {
    useAppStore.setState({ spawnTasks: {} });
  });

  it("bumps the nonce on every queue so a repeat run re-fires", () => {
    const s = useAppStore.getState();

    s.queueSpawnTask("proj", cmd("first"));
    const first = useAppStore.getState().spawnTasks.proj;
    expect(first.tasks).toEqual([cmd("first")]);

    // The consumer drained the first queue.
    s.consumeSpawnTasks("proj");
    expect(useAppStore.getState().spawnTasks.proj).toBeUndefined();

    s.queueSpawnTask("proj", cmd("second"));
    const second = useAppStore.getState().spawnTasks.proj;
    expect(second.tasks).toEqual([cmd("second")]);
    expect(second.nonce).toBeGreaterThan(first.nonce);
  });

  it("appends when a prior queue hasn't been consumed yet", () => {
    const s = useAppStore.getState();

    s.queueSpawnTask("proj", cmd("a"));
    const afterFirst = useAppStore.getState().spawnTasks.proj;
    s.queueSpawnTask("proj", cmd("b"));
    const afterSecond = useAppStore.getState().spawnTasks.proj;

    expect(afterSecond.tasks).toEqual([cmd("a"), cmd("b")]);
    expect(afterSecond.nonce).toBeGreaterThan(afterFirst.nonce);
  });

  it("consuming drops only the target project's queue", () => {
    const s = useAppStore.getState();
    s.queueSpawnTask("a", cmd("x"));
    s.queueSpawnTask("b", cmd("y"));

    s.consumeSpawnTasks("a");

    expect(useAppStore.getState().spawnTasks.a).toBeUndefined();
    expect(useAppStore.getState().spawnTasks.b.tasks).toEqual([cmd("y")]);
  });
});
