// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  browseFolder: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  unarchiveProject: vi.fn(),
}));

// vi.mock hoists above any const, so the factories are inlined. `then` must
// stay undefined: a function there makes the mocked module thenable and
// vitest awaits it forever.
vi.mock("../../bridge/commands", () =>
  new Proxy({}, {
    has: () => true,
    get: (_t, prop) =>
      prop === "then"
        ? undefined
        : prop === "CreateProject"
          ? mocks.createProject
          : prop === "BrowseFolder"
            ? mocks.browseFolder
            : prop === "UnarchiveProject"
              ? mocks.unarchiveProject
              : vi.fn(),
  }));
vi.mock("../../bridge/runtime", () =>
  new Proxy({}, {
    has: () => true,
    get: (_t, prop) => (prop === "then" ? undefined : vi.fn()),
  }));
vi.mock("../notifications/toast", () => ({
  toast: Object.assign(vi.fn(), { error: mocks.toastError, info: mocks.toastInfo, success: vi.fn() }),
}));

import type { ArchivedProject } from "../projectArchive";
import { useAppStore } from "./app";
import { useProjectArchiveStore } from "./projectArchive";

const archived = (name: string): ArchivedProject => ({
  name,
  label: name,
  root: `/code/${name}`,
  isRemote: false,
  archivedAt: 1,
  copies: 0,
  automations: 0,
  machine: "",
});

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({
    projects: [],
    selected: null,
    view: "terminals",
    addProjectTarget: null,
    refreshProjects: vi.fn(async () => {}),
  });
  useProjectArchiveStore.setState({ byMachine: {}, load: vi.fn(async () => {}) });
});

describe("addLocalFolder", () => {
  it("adopts the folder under its own name without opening it", async () => {
    mocks.createProject.mockResolvedValue({ name: "storefront", existing: false, services: [] });

    const adopted = await useAppStore.getState().addLocalFolder("/code/storefront");

    expect(mocks.createProject).toHaveBeenCalledWith("storefront", "/code/storefront");
    expect(adopted).toEqual({ name: "storefront", existing: false, services: [] });
    expect(useAppStore.getState().refreshProjects).toHaveBeenCalled();
    expect(useAppStore.getState().selected).toBeNull();
  });

  it("reports a failure and answers null", async () => {
    mocks.createProject.mockRejectedValue("permission denied");

    expect(await useAppStore.getState().addLocalFolder("/code/locked")).toBeNull();
    expect(mocks.toastError).toHaveBeenCalledWith("Failed to add project: permission denied");
  });

  it("is the path the picker's Local folder takes, which then opens the project", async () => {
    mocks.browseFolder.mockResolvedValue("/code/api");
    mocks.createProject.mockResolvedValue({ name: "api", existing: false, services: [] });

    await useAppStore.getState().pickAddProjectKind("local");

    expect(mocks.createProject).toHaveBeenCalledWith("api", "/code/api");
    expect(useAppStore.getState().selected).toBe("api");
    expect(useAppStore.getState().view).toBe("projects");
  });

  it("says an archived project's folder is archived instead of opening a project the sidebar doesn't list", async () => {
    useProjectArchiveStore.setState({ byMachine: { "": [archived("docs-site")] } });
    mocks.browseFolder.mockResolvedValue("/code/docs-site");
    mocks.createProject.mockResolvedValue({ name: "docs-site", existing: true, services: [] });

    await useAppStore.getState().pickAddProjectKind("local");

    expect(useAppStore.getState().selected).toBeNull();
    expect(useAppStore.getState().view).toBe("terminals");
    expect(mocks.toastInfo).toHaveBeenCalledTimes(1);
    const [title, options] = mocks.toastInfo.mock.calls[0];
    expect(title).toBe("docs-site is archived");
    expect(options.action.label).toBe("Unarchive");
  });

  it("unarchives from that notice and opens the project once the sidebar lists it", async () => {
    useProjectArchiveStore.setState({ byMachine: { "": [archived("docs-site")] } });
    mocks.createProject.mockResolvedValue({ name: "docs-site", existing: true, services: [] });
    mocks.unarchiveProject.mockImplementation(async () => {
        useAppStore.setState({ projects: [{ name: "docs-site" }] as never });
    });

    expect(await useAppStore.getState().addLocalFolder("/code/docs-site")).toBeNull();
    mocks.toastInfo.mock.calls[0][1].action.onClick();
    await vi.waitFor(() => expect(useAppStore.getState().selected).toBe("docs-site"));

    expect(mocks.unarchiveProject).toHaveBeenCalledWith("docs-site");
    expect(useAppStore.getState().view).toBe("projects");
  });

  it("still points at an existing project that isn't archived", async () => {
    useAppStore.setState({ projects: [{ name: "api" }] as never });
    mocks.createProject.mockResolvedValue({ name: "api", existing: true, services: [] });

    expect(await useAppStore.getState().addLocalFolder("/code/api")).toEqual({ name: "api", existing: true, services: [] });
    expect(mocks.toastInfo).toHaveBeenCalledWith("That folder is already the project “api”.");
  });
});
