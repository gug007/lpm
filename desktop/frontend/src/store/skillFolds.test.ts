// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_FOLDS, type LpmCommandLists, type SkillFolds } from "../lpmCommands";

const bridge = vi.hoisted(() => ({
  LoadSkillFolds: vi.fn<(project: string) => Promise<SkillFolds>>(),
  SetSkillFold: vi.fn<(...args: unknown[]) => Promise<SkillFolds>>(),
  ListLpmCommands: vi.fn<(project: string) => Promise<LpmCommandLists>>(),
  RenameLpmCommandFolder: vi.fn<(...args: unknown[]) => Promise<LpmCommandLists>>(),
  listeners: new Map<string, Set<() => void>>(),
}));

vi.mock("../../bridge/commands", () => ({
  LoadSkillFolds: bridge.LoadSkillFolds,
  SetSkillFold: bridge.SetSkillFold,
  ListLpmCommands: bridge.ListLpmCommands,
  RenameLpmCommandFolder: bridge.RenameLpmCommandFolder,
}));

vi.mock("../../bridge/runtime", () => ({
  EventsOn: (name: string, callback: () => void) => {
    const listeners = bridge.listeners.get(name) ?? new Set();
    bridge.listeners.set(name, listeners);
    listeners.add(callback);
    return () => listeners.delete(callback);
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const project = "web";
const none = { closed: [], othersOpen: false };
const folds = (...closed: string[]): SkillFolds => ({ global: none, project: { closed, othersOpen: false } });
const lists = (answer: SkillFolds | undefined): LpmCommandLists => ({
  global: { folders: [], commands: [] },
  project: null,
  projectError: null,
  ...(answer ? { folds: answer } : {}),
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
const announce = () => act(async () => bridge.listeners.get("skill-folds-changed")?.forEach((listener) => listener()));

let seen: SkillFolds;
let root: Root | null;

async function mountStore(active = true) {
  const store = await import("./skillFolds");
  function Probe({ on }: { on: boolean }) {
    seen = store.useSkillFolds(project, on);
    return null;
  }
  root = createRoot(document.createElement("div"));
  await act(async () => root?.render(createElement(Probe, { on: active })));
  await settle();
  return store;
}

describe("skill folds", () => {
  beforeEach(() => {
    vi.resetModules();
    root = null;
    bridge.listeners.clear();
    for (const mock of [bridge.LoadSkillFolds, bridge.SetSkillFold, bridge.ListLpmCommands, bridge.RenameLpmCommandFolder]) {
      mock.mockReset();
    }
    bridge.LoadSkillFolds.mockResolvedValue(NO_FOLDS);
  });

  afterEach(() => {
    act(() => root?.unmount());
  });

  it("shows nothing closed until a read says otherwise", async () => {
    const read = deferred<SkillFolds>();
    bridge.LoadSkillFolds.mockReturnValue(read.promise);
    await mountStore();
    expect(seen).toEqual(NO_FOLDS);
    read.resolve(folds("Work"));
    await settle();
    expect(seen).toEqual(folds("Work"));
  });

  it("shows nothing closed when the computer holding the project can't answer", async () => {
    bridge.LoadSkillFolds.mockRejectedValue("Command load_skill_folds not found");
    await mountStore();
    expect(seen).toEqual(NO_FOLDS);
  });

  it("shows a click at once and saves it", async () => {
    const write = deferred<SkillFolds>();
    bridge.SetSkillFold.mockReturnValue(write.promise);
    const { setSkillFold } = await mountStore();
    act(() => setSkillFold(project, "project", "Work", false));
    expect(seen).toEqual(folds("Work"));
    expect(bridge.SetSkillFold).toHaveBeenCalledWith(project, "project", "Work", false);
    write.resolve(folds("Work"));
    await settle();
    expect(seen).toEqual(folds("Work"));
  });

  it("keeps a click on a computer too old to save it", async () => {
    bridge.LoadSkillFolds.mockRejectedValue("Command load_skill_folds not found");
    bridge.SetSkillFold.mockRejectedValue("Command set_skill_fold not found");
    const { setSkillFold } = await mountStore();
    act(() => setSkillFold(project, "project", "Work", false));
    await settle();
    expect(seen).toEqual(folds("Work"));
  });

  it("keeps what it had when a later read fails", async () => {
    bridge.LoadSkillFolds.mockResolvedValueOnce(folds("Work"));
    await mountStore();
    bridge.LoadSkillFolds.mockRejectedValueOnce("offline");
    await announce();
    await settle();
    expect(seen).toEqual(folds("Work"));
  });

  it("lets a read from before a click go", async () => {
    const { setSkillFold } = await mountStore();
    const stale = deferred<SkillFolds>();
    bridge.LoadSkillFolds.mockReturnValueOnce(stale.promise);
    await announce();
    bridge.SetSkillFold.mockResolvedValue(folds("Work"));
    act(() => setSkillFold(project, "project", "Work", false));
    stale.resolve(NO_FOLDS);
    await settle();
    expect(seen).toEqual(folds("Work"));
  });

  it("lets the answer to an earlier click go when two come close together", async () => {
    const { setSkillFold } = await mountStore();
    const first = deferred<SkillFolds>();
    const second = deferred<SkillFolds>();
    bridge.SetSkillFold.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    act(() => {
      setSkillFold(project, "project", "Work", false);
      setSkillFold(project, "project", "Home", false);
    });
    second.resolve(folds("Home", "Work"));
    await settle();
    first.resolve(folds("Work"));
    await settle();
    expect(seen).toEqual(folds("Home", "Work"));
  });

  it("holds folders in the order they're saved in, so the answer changes nothing", async () => {
    bridge.LoadSkillFolds.mockResolvedValueOnce(folds("Work"));
    bridge.SetSkillFold.mockReturnValue(new Promise(() => {}));
    const { setSkillFold } = await mountStore();
    act(() => setSkillFold(project, "project", "Home", false));
    expect(seen).toEqual(folds("Home", "Work"));
  });

  it("reads again when another window or computer folds", async () => {
    await mountStore();
    bridge.LoadSkillFolds.mockResolvedValueOnce(folds("Work"));
    await announce();
    await settle();
    expect(seen).toEqual(folds("Work"));
  });

  it("reads nothing for a tree out of view, and stops when one goes", async () => {
    await mountStore(false);
    expect(bridge.LoadSkillFolds).not.toHaveBeenCalled();
    expect(bridge.listeners.get("skill-folds-changed")?.size ?? 0).toBe(0);
    await mountStore(true);
    expect(bridge.listeners.get("skill-folds-changed")?.size).toBe(1);
    act(() => root?.unmount());
    expect(bridge.listeners.get("skill-folds-changed")?.size).toBe(0);
  });

  it("opens the Other skills group of one list only, leaving folders alone", async () => {
    bridge.LoadSkillFolds.mockResolvedValue(folds("Work"));
    bridge.SetSkillFold.mockReturnValue(new Promise(() => {}));
    const { setSkillFold } = await mountStore();
    act(() => setSkillFold(project, "project", null, true));
    expect(seen).toEqual({ global: none, project: { closed: ["Work"], othersOpen: true } });
  });

  describe("arriving with the lists", () => {
    const stores = async () => ({ ...(await mountStore()), ...(await import("./lpmCommands")) });

    it("lands a folder and its fold together", async () => {
      const { useLpmCommandsStore } = await stores();
      bridge.ListLpmCommands.mockResolvedValue(lists(folds("Jobs")));
      await act(() => useLpmCommandsStore.getState().load(project));
      expect(seen).toEqual(folds("Jobs"));
    });

    it("takes a rename's answer, for a folder moved from anywhere", async () => {
      const { renameLpmCommandFolder } = await stores();
      bridge.RenameLpmCommandFolder.mockResolvedValue(lists(folds("Jobs")));
      await act(() => renameLpmCommandFolder(project, "project", "Work", "Jobs"));
      expect(seen).toEqual(folds("Jobs"));
    });

    it("changes nothing when a rename is refused", async () => {
      bridge.LoadSkillFolds.mockResolvedValue(folds("Work"));
      const { renameLpmCommandFolder } = await stores();
      bridge.RenameLpmCommandFolder.mockRejectedValue("A folder named Home already exists.");
      await act(() => renameLpmCommandFolder(project, "project", "Work", "Home").catch(() => {}));
      expect(seen).toEqual(folds("Work"));
    });

    it("keeps what's held when an older computer's lists have none", async () => {
      bridge.LoadSkillFolds.mockResolvedValue(folds("Work"));
      const { useLpmCommandsStore } = await stores();
      bridge.ListLpmCommands.mockResolvedValue(lists(undefined));
      await act(() => useLpmCommandsStore.getState().load(project));
      expect(seen).toEqual(folds("Work"));
    });

    it("lets lists read before a click go, though the lists themselves land", async () => {
      const { setSkillFold, useLpmCommandsStore } = await stores();
      const read = deferred<LpmCommandLists>();
      bridge.ListLpmCommands.mockReturnValue(read.promise);
      bridge.SetSkillFold.mockReturnValue(new Promise(() => {}));
      const loading = useLpmCommandsStore.getState().load(project);
      act(() => setSkillFold(project, "project", "Work", false));
      read.resolve(lists(NO_FOLDS));
      await act(() => loading);
      expect(seen).toEqual(folds("Work"));
      expect(useLpmCommandsStore.getState().byProject[project]).toBeTruthy();
    });
  });
});
