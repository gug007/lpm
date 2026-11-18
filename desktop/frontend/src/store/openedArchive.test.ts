import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  getProject: vi.fn(),
  stopProject: vi.fn(),
}));

vi.mock("../../bridge/commands", () =>
  new Proxy({}, {
    has: () => true,
    get: (_t, prop) =>
      prop === "then"
        ? undefined
        : prop === "ListProjects"
          ? mocks.listProjects
          : prop === "GetProject"
            ? mocks.getProject
            : prop === "StopProject"
              ? mocks.stopProject
              : vi.fn(),
  }));
vi.mock("../../bridge/runtime", () =>
  new Proxy({}, {
    has: () => true,
    get: (_t, prop) => (prop === "then" ? undefined : vi.fn()),
  }));
vi.mock("../notifications/toast", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), info: vi.fn(), success: vi.fn() }),
}));

import type { ProjectInfo } from "../types";
import { useAppStore } from "./app";

const project = (name: string, running = false) => ({ name, running }) as ProjectInfo;
const names = () => useAppStore.getState().projects.map((p) => `${p.name}${p.archived ? "*" : ""}`);

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({
    projects: [],
    openedArchive: null,
    selected: null,
    view: "archive",
    sidebarOrder: [],
    groups: [],
    reconcileSidebarLayout: vi.fn(),
  });
  mocks.listProjects.mockResolvedValue([project("api")]);
  mocks.getProject.mockImplementation(async (name: string) => project(name));
});

describe("an archived project opened for now", () => {
  it("joins the list marked archived and becomes the open project", async () => {
    await useAppStore.getState().openArchived("docs");

    expect(names()).toEqual(["api", "docs*"]);
    expect(useAppStore.getState().selected).toBe("docs");
    expect(useAppStore.getState().view).toBe("projects");
  });

  it("stays listed across refreshes until it is closed", async () => {
    await useAppStore.getState().openArchived("docs");
    await useAppStore.getState().refreshProjects();
    expect(names()).toEqual(["api", "docs*"]);

    await useAppStore.getState().closeArchived("docs");

    expect(names()).toEqual(["api"]);
    expect(useAppStore.getState().selected).toBeNull();
    expect(mocks.stopProject).not.toHaveBeenCalled();
  });

  it("stops its services when it is closed while running", async () => {
    let running = true;
    mocks.getProject.mockImplementation(async (name: string) => project(name, running));
    mocks.stopProject.mockImplementation(async () => {
      running = false;
    });
    await useAppStore.getState().openArchived("docs");

    await useAppStore.getState().closeArchived("docs");

    expect(mocks.stopProject).toHaveBeenCalledWith("docs");
    expect(names()).toEqual(["api"]);
  });

  it("stays open when its services can't be stopped", async () => {
    mocks.getProject.mockImplementation(async (name: string) => project(name, true));
    mocks.stopProject.mockRejectedValue("busy");
    await useAppStore.getState().openArchived("docs");

    await useAppStore.getState().closeArchived("docs");

    expect(names()).toEqual(["api", "docs*"]);
  });

  it("is listed once, unmarked, after it is unarchived", async () => {
    await useAppStore.getState().openArchived("docs");
    mocks.listProjects.mockResolvedValue([project("api"), project("docs")]);

    await useAppStore.getState().refreshProjects();

    expect(names()).toEqual(["api", "docs"]);
    expect(useAppStore.getState().openedArchive).toBeNull();
  });

  it("says so when the project can't be read, and opens nothing", async () => {
    mocks.getProject.mockResolvedValue(null);

    await useAppStore.getState().openArchived("gone");

    expect(names()).toEqual(["api"]);
    expect(useAppStore.getState().selected).toBeNull();
    expect(useAppStore.getState().openedArchive).toBeNull();
  });

  it("closes the one that was open when another is opened", async () => {
    await useAppStore.getState().openArchived("docs");
    await useAppStore.getState().openArchived("blog");

    expect(names()).toEqual(["api", "blog*"]);
  });
});
