import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectGroup, ProjectInfo } from "../types";

// `then` must stay undefined on the Proxy mocks: a function there makes the
// mocked module thenable and vitest awaits it forever.
const h = vi.hoisted(() => ({
  LoadGroups: vi.fn(),
  SaveGroups: vi.fn(),
  LoadSettings: vi.fn(),
  SaveSettings: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("../../bridge/commands", () =>
  new Proxy({}, {
    has: () => true,
    get: (_t, prop) => {
      if (prop === "then") return undefined;
      if (prop in h) return h[prop as keyof typeof h];
      return vi.fn();
    },
  }));
vi.mock("../../bridge/runtime", () =>
  new Proxy({}, {
    has: () => true,
    get: (_t, prop) => (prop === "then" ? undefined : vi.fn()),
  }));
vi.mock("../notifications/toast", () => ({
  toast: Object.assign(vi.fn(), { error: h.toastError, success: vi.fn() }),
}));

import { hydrateAppStore, useAppStore } from "./app";

const project = (name: string): ProjectInfo => ({
  name,
  session: name,
  root: `/projects/${name}`,
  running: false,
  services: [],
  allServices: [],
  actions: [],
  profiles: [],
  activeProfile: "",
  statusEntries: [],
  isRemote: false,
});

const work: ProjectGroup = { id: "w", name: "work", members: ["api", "web"] };
const onDisk = { order: ["home", "group:w"], groups: [work] };
const saved = () => h.SaveGroups.mock.calls.map(([cfg]) => cfg.groups as ProjectGroup[]);

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.LoadGroups.mockResolvedValue({ groups: onDisk.groups });
  h.LoadSettings.mockResolvedValue({ sidebarOrder: onDisk.order });
  h.SaveGroups.mockResolvedValue(undefined);
  h.SaveSettings.mockResolvedValue(undefined);
});

describe("sidebar folders that couldn't be read", () => {
  it("reads them before reconciling, rather than saving their projects as loose", async () => {
    hydrateAppStore(null);
    useAppStore.setState({ projects: [project("home"), project("api"), project("web")] });
    useAppStore.getState().reconcileSidebarLayout(useAppStore.getState().projects);
    await vi.waitFor(() => expect(useAppStore.getState().foldersRead).toBe(true));
    expect(useAppStore.getState().groups).toEqual([work]);
    expect(saved().every((groups) => groups.every((g) => g.members.length > 0))).toBe(true);
  });

  it("stays unread and saves nothing while the file can't be read", async () => {
    h.LoadGroups.mockRejectedValue("Couldn't read your folders");
    hydrateAppStore(null);
    useAppStore.setState({ projects: [project("home"), project("api")] });
    useAppStore.getState().reconcileSidebarLayout(useAppStore.getState().projects);
    await useAppStore.getState().applySidebarLayout({ order: ["api", "home"], groups: [] });
    expect(useAppStore.getState().foldersRead).toBe(false);
    expect(h.SaveGroups).not.toHaveBeenCalled();
    expect(h.toastError).toHaveBeenCalledWith("Couldn't read your folders, so this change wasn't saved");
  });

  it("doesn't save a change when the file can't be re-read to merge it", async () => {
    hydrateAppStore({ groups: [work] });
    useAppStore.setState({ projects: [project("home"), project("api"), project("web")], sidebarOrder: onDisk.order });
    h.LoadGroups.mockRejectedValue("Couldn't read your folders");
    await useAppStore.getState().applySidebarLayout({ order: onDisk.order, groups: [{ ...work, collapsed: true }] });
    expect(h.SaveGroups).not.toHaveBeenCalled();
    expect(h.toastError).toHaveBeenCalled();
  });
});
