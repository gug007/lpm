import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock hoists above any const, so shared state must come from vi.hoisted.
// `then` must stay undefined on the Proxy mocks: a function there makes the
// mocked module thenable and vitest awaits it forever.
const h = vi.hoisted(() => ({
  ListProjects: vi.fn(),
}));

vi.mock("../../bridge/commands", () =>
  new Proxy({}, {
    has: () => true,
    get: (_t, prop) => {
      if (prop === "then") return undefined;
      if (prop === "ListProjects") return h.ListProjects;
      return vi.fn();
    },
  }));
vi.mock("../../bridge/runtime", () =>
  new Proxy({}, {
    has: () => true,
    get: (_t, prop) => (prop === "then" ? undefined : vi.fn()),
  }));

import { useAppStore } from "./app";
import type { ProjectInfo } from "../types";

const project = (name: string, running = false): ProjectInfo => ({
  name,
  session: name,
  root: `/projects/${name}`,
  running,
  services: [],
  allServices: [],
  actions: [],
  profiles: [],
  activeProfile: "",
  statusEntries: [],
  isRemote: false,
});

describe("refreshProjects ordering", () => {
  beforeEach(() => {
    h.ListProjects.mockReset();
    useAppStore.setState({
      projects: [],
      // Matches the fresh list so reconcileSidebarLayout is a no-op.
      sidebarOrder: ["app", "copy"],
      groups: [],
    });
  });

  it("drops a slow stale response that resolves after a newer refresh", async () => {
    const stale = [project("app")];
    const fresh = [project("app", true), project("copy")];

    let releaseStale!: (list: ProjectInfo[]) => void;
    h.ListProjects
      .mockImplementationOnce(
        () =>
          new Promise<ProjectInfo[]>((resolve) => {
            releaseStale = resolve;
          }),
      )
      .mockResolvedValueOnce(fresh);

    const { refreshProjects } = useAppStore.getState();
    const slowFirst = refreshProjects();
    await refreshProjects();
    expect(useAppStore.getState().projects).toEqual(fresh);

    releaseStale(stale);
    await slowFirst;
    expect(useAppStore.getState().projects).toEqual(fresh);
  });
});

describe("refreshProjects while held", () => {
  beforeEach(() => {
    h.ListProjects.mockReset();
    useAppStore.setState({ projects: [project("app")], sidebarOrder: ["app"], groups: [] });
  });

  it("waits for the release instead of undoing a preview", async () => {
    const onDisk = [project("app", true)];
    h.ListProjects.mockResolvedValue(onDisk);
    const preview = [{ ...project("app"), actions: [{ name: "lint", label: "Lint", display: "footer" }] }] as ProjectInfo[];

    const release = useAppStore.getState().holdProjectsRefresh();
    useAppStore.setState({ projects: preview });
    let done = false;
    const refreshed = useAppStore.getState().refreshProjects().then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(h.ListProjects).not.toHaveBeenCalled();
    expect(useAppStore.getState().projects).toBe(preview);
    expect(done).toBe(false);

    release();
    await refreshed;
    expect(h.ListProjects).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().projects).toEqual(onDisk);
  });

  it("drops a read that was in flight when the hold began, then reads again", async () => {
    const stale = [project("app")];
    const saved = [project("app", true)];
    let answer!: (list: ProjectInfo[]) => void;
    h.ListProjects
      .mockImplementationOnce(() => new Promise<ProjectInfo[]>((resolve) => (answer = resolve)))
      .mockResolvedValueOnce(saved);
    const optimistic = [{ ...project("app"), activeProfile: "dropped" }];

    const refreshed = useAppStore.getState().refreshProjects();
    const release = useAppStore.getState().holdProjectsRefresh();
    useAppStore.setState({ projects: optimistic });
    answer(stale);
    await Promise.resolve();
    await Promise.resolve();
    expect(useAppStore.getState().projects).toBe(optimistic);

    release();
    await refreshed;
    expect(useAppStore.getState().projects).toEqual(saved);
  });

  it("runs one refresh after the last of several holds", async () => {
    h.ListProjects.mockResolvedValue([project("app", true)]);
    const { holdProjectsRefresh, refreshProjects } = useAppStore.getState();
    const first = holdProjectsRefresh();
    const second = holdProjectsRefresh();
    const a = refreshProjects();
    const b = refreshProjects();
    first();
    first();
    await Promise.resolve();
    expect(h.ListProjects).not.toHaveBeenCalled();
    second();
    await Promise.all([a, b]);
    expect(h.ListProjects).toHaveBeenCalledTimes(1);
  });
});
