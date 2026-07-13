import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock hoists above any const, so shared state must come from vi.hoisted.
// `then` must stay undefined on the Proxy mocks: a function there makes the
// mocked module thenable and vitest awaits it forever.
const h = vi.hoisted(() => {
  const listeners = new Map<string, Set<(p: unknown) => void>>();
  return {
    listeners,
    EventsOn: (name: string, cb: (p: unknown) => void) => {
      let set = listeners.get(name);
      if (!set) {
        set = new Set();
        listeners.set(name, set);
      }
      set.add(cb);
      return () => {
        set!.delete(cb);
      };
    },
    emit(name: string, payload: unknown) {
      for (const cb of [...(listeners.get(name) ?? [])]) cb(payload);
    },
    DuplicateProject: vi.fn(),
    StartDuplicateProject: vi.fn(),
    DuplicateStatus: vi.fn(async () => "running" as unknown),
    PeerState: vi.fn(async () => ({ peers: [] })),
  };
});

vi.mock("../../bridge/commands", () =>
  new Proxy({}, {
    has: () => true,
    get: (_t, prop) => {
      if (prop === "then") return undefined;
      if (prop === "DuplicateProject") return h.DuplicateProject;
      if (prop === "StartDuplicateProject") return h.StartDuplicateProject;
      if (prop === "DuplicateStatus") return h.DuplicateStatus;
      if (prop === "PeerState") return h.PeerState;
      return vi.fn();
    },
  }));
vi.mock("../../bridge/runtime", () =>
  new Proxy({}, {
    has: () => true,
    get: (_t, prop) =>
      prop === "then" ? undefined : prop === "EventsOn" ? h.EventsOn : vi.fn(),
  }));

import { useAppStore } from "./app";
import type { SpawnTask } from "../types";

const SLUG = "aaaaaaaa";
const peerApp = `peer-${SLUG}-app`;
const cmd = (command: string): SpawnTask => ({ kind: "command", command });

describe("bulkDuplicate per-copy targets", () => {
  beforeEach(() => {
    h.listeners.clear();
    h.DuplicateProject.mockReset();
    h.StartDuplicateProject.mockReset();
    h.DuplicateStatus.mockReset();
    h.DuplicateStatus.mockResolvedValue("running");
    useAppStore.setState({
      projects: [],
      spawnTasks: {},
      duplicatingNames: [],
      selected: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates each copy from its target: local inline, peer via start + duplicate-done", async () => {
    let localN = 0;
    h.DuplicateProject.mockImplementation(async () => `app-copy-${++localN}`);
    // The done event fires before wait() is called for it — the pre-armed
    // collector must buffer it, not drop it.
    h.StartDuplicateProject.mockImplementation(async () => {
      h.emit("duplicate-done", { name: `${peerApp}-r1`, ok: true, error: null });
      return `${peerApp}-r1`;
    });

    await useAppStore.getState().bulkDuplicate("app", 3, {
      targetsPerCopy: ["app", peerApp, "app"],
      tasksPerCopy: [[cmd("a")], [cmd("b")], [cmd("c")]],
    });

    expect(h.DuplicateProject).toHaveBeenCalledTimes(2);
    expect(h.DuplicateProject.mock.calls.every((c) => c[0] === "app")).toBe(true);
    expect(h.StartDuplicateProject).toHaveBeenCalledTimes(1);
    expect(h.StartDuplicateProject.mock.calls[0][0]).toBe(peerApp);

    const spawn = useAppStore.getState().spawnTasks;
    expect(spawn["app-copy-1"].tasks).toEqual([cmd("a")]);
    expect(spawn[`${peerApp}-r1`].tasks).toEqual([cmd("b")]);
    expect(spawn["app-copy-2"].tasks).toEqual([cmd("c")]);
    expect(useAppStore.getState().selected).toBe("app-copy-1");
  });

  it("defaults every copy to the source and disposes collectors when done", async () => {
    let n = 0;
    h.StartDuplicateProject.mockImplementation(async () => {
      const name = `${peerApp}-r${++n}`;
      h.emit("duplicate-done", { name, ok: true, error: null });
      return name;
    });

    await useAppStore.getState().bulkDuplicate(peerApp, 2, {});

    expect(h.DuplicateProject).not.toHaveBeenCalled();
    expect(h.StartDuplicateProject).toHaveBeenCalledTimes(2);
    expect(h.StartDuplicateProject.mock.calls.every((c) => c[0] === peerApp)).toBe(true);
    expect(h.listeners.get("duplicate-done")?.size ?? 0).toBe(0);
    expect(h.listeners.get("peer-state-changed")?.size ?? 0).toBe(0);
  });

  it("surfaces a failed peer duplicate without creating later copies", async () => {
    h.StartDuplicateProject.mockImplementation(async () => {
      h.emit("duplicate-done", { name: `${peerApp}-r1`, ok: false, error: "boom" });
      return `${peerApp}-r1`;
    });

    await useAppStore.getState().bulkDuplicate(peerApp, 2, {});

    expect(h.StartDuplicateProject).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().duplicatingNames).toEqual([]);
    expect(h.listeners.get("duplicate-done")?.size ?? 0).toBe(0);
  });

  it("settles via the duplicate_status poll when the done event is lost", async () => {
    vi.useFakeTimers();
    h.StartDuplicateProject.mockResolvedValue(`${peerApp}-r1`);
    h.DuplicateStatus.mockResolvedValue({ done: { ok: true, error: null } });

    const run = useAppStore.getState().bulkDuplicate(peerApp, 1, {});
    await vi.advanceTimersByTimeAsync(10_000);
    await run;

    expect(h.DuplicateStatus).toHaveBeenCalledWith(`${peerApp}-r1`);
    expect(useAppStore.getState().duplicatingNames).toEqual([]);
    expect(useAppStore.getState().selected).toBe(`${peerApp}-r1`);
    expect(h.listeners.get("duplicate-done")?.size ?? 0).toBe(0);
  });

  it("fails via the poll when the host no longer knows the copy", async () => {
    vi.useFakeTimers();
    h.StartDuplicateProject.mockResolvedValue(`${peerApp}-r1`);
    h.DuplicateStatus.mockResolvedValue("unknown");

    const run = useAppStore.getState().bulkDuplicate(peerApp, 1, {});
    await vi.advanceTimersByTimeAsync(10_000);
    await run;

    expect(useAppStore.getState().duplicatingNames).toEqual([]);
    expect(useAppStore.getState().selected).toBeNull();
    expect(h.listeners.get("duplicate-done")?.size ?? 0).toBe(0);
  });

  it("falls back to the synchronous duplicate when the host lacks the start command", async () => {
    h.StartDuplicateProject.mockRejectedValue(
      "Command start_duplicate_project not found",
    );
    let n = 0;
    h.DuplicateProject.mockImplementation(async () => `${peerApp}-r${++n}`);

    await useAppStore.getState().bulkDuplicate(peerApp, 2, {});

    expect(h.StartDuplicateProject).toHaveBeenCalledTimes(1);
    expect(h.DuplicateProject).toHaveBeenCalledTimes(2);
    expect(h.DuplicateProject.mock.calls.every((c) => c[0] === peerApp)).toBe(true);
  });

  it("does not swallow a real start failure into the fallback", async () => {
    h.StartDuplicateProject.mockRejectedValue("could not generate a unique duplicate name");

    await useAppStore.getState().bulkDuplicate(peerApp, 2, {});

    expect(h.StartDuplicateProject).toHaveBeenCalledTimes(1);
    expect(h.DuplicateProject).not.toHaveBeenCalled();
    expect(useAppStore.getState().duplicatingNames).toEqual([]);
  });
});
