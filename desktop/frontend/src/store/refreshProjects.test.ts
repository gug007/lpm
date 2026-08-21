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
