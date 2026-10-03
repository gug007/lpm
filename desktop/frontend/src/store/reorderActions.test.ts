import { beforeEach, describe, expect, it, vi } from "vitest";
import YAML from "yaml";

// vi.mock hoists above any const, so shared state must come from vi.hoisted.
// `then` must stay undefined on the Proxy mocks: a function there makes the
// mocked module thenable and vitest awaits it forever.
const h = vi.hoisted(() => ({
  ReadConfig: vi.fn(),
  SaveConfig: vi.fn(),
  ListProjects: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("../../bridge/commands", () =>
  new Proxy({}, {
    has: () => true,
    get: (_t, prop) => {
      if (prop === "then") return undefined;
      if (prop === "ReadConfig") return h.ReadConfig;
      if (prop === "SaveConfig") return h.SaveConfig;
      if (prop === "ListProjects") return h.ListProjects;
      return vi.fn();
    },
  }));
vi.mock("../../bridge/runtime", () =>
  new Proxy({}, {
    has: () => true,
    get: (_t, prop) => (prop === "then" ? undefined : vi.fn()),
  }));
vi.mock("sonner", () => ({ toast: { error: h.toastError } }));

import { useAppStore } from "./app";
import { buildActionsModel } from "../actionsLayoutModel";
import { applyMove, layoutWithoutZone, zoneItemId } from "../components/actionsDndLayout";
import type { ActionInfo, ActionsLayout, ProjectInfo } from "../types";

const NAME = "app";

const CONFIG = `zones:
  build:
    rows: 1
actions:
  test: make test
  lint: make lint
  logs:
    cmd: make logs
    display: footer
  ios:
    cmd: make ios
    display: build
`;

const action = (name: string, display = ""): ActionInfo =>
  ({ name, label: name, cmd: `make ${name}`, confirm: false, display }) as ActionInfo;

const project: ProjectInfo = {
  name: NAME,
  session: NAME,
  root: `/projects/${NAME}`,
  running: false,
  services: [],
  allServices: [],
  actions: [action("test"), action("lint"), action("logs", "footer"), action("ios", "build")],
  zones: [{ name: "build", label: "Build", rows: 1, source: "project" }],
  profiles: [],
  activeProfile: "",
  statusEntries: [],
  isRemote: false,
};

const startLayout = buildActionsModel(project.actions, project.zones ?? []).layout;

const saved = () => YAML.parse(h.SaveConfig.mock.calls[0][1]).actions;

// A drag previews each cross-group move into the store, then commits on drop.
async function drag(after: ActionsLayout) {
  const { previewReorderActions, reorderActions } = useAppStore.getState();
  previewReorderActions(NAME, after);
  await reorderActions(NAME, after, startLayout);
}

beforeEach(() => {
  h.ReadConfig.mockReset().mockResolvedValue(CONFIG);
  h.SaveConfig.mockReset().mockResolvedValue(undefined);
  h.ListProjects.mockReset().mockResolvedValue([project]);
  h.toastError.mockReset();
  useAppStore.setState({ projects: [project] });
});

describe("reorderActions after a drag", () => {
  it("saves the footer for a button dragged there", async () => {
    await drag(applyMove(startLayout, "test", { group: "footer", index: 1 }));
    expect(saved().test).toEqual({ cmd: "make test", position: 2, display: "footer" });
    expect(saved().lint).toEqual({ cmd: "make lint", position: 2 });
  });

  it("saves the zone for a button dragged into it", async () => {
    await drag(applyMove(startLayout, "test", { group: "zone:build", index: 0 }));
    expect(saved().test).toEqual({ cmd: "make test", position: 1, display: "build" });
    expect(saved().ios).toEqual({ cmd: "make ios", position: 2, display: "build" });
  });

  it("saves the header for a button dragged out of a zone", async () => {
    await drag(applyMove(startLayout, "ios", { group: "header", index: 0 }));
    expect(saved().ios).toEqual({ cmd: "make ios", position: 1, display: "header" });
  });

  it("saves a move that was never previewed, like the context menu makes", async () => {
    const after = applyMove(startLayout, "test", { group: "footer", index: 1 });
    await useAppStore.getState().reorderActions(NAME, after);
    expect(saved().test).toEqual({ cmd: "make test", position: 2, display: "footer" });
  });
});

describe("reorderActions for a zone that went away", () => {
  it("saves the header for its buttons, whatever zone note they had", async () => {
    const after = layoutWithoutZone(startLayout, "build");
    await useAppStore.getState().reorderActions(NAME, after, startLayout);
    expect(saved().ios).toEqual({ cmd: "make ios", position: 1, display: "header" });
    expect(saved().lint).toEqual({ cmd: "make lint", position: 2 });
  });
});

describe("reorderActions for a zone that changes rows", () => {
  it("saves footer for a zone dragged into the footer", async () => {
    await drag(applyMove(startLayout, zoneItemId("build"), { group: "footer", index: 1 }));
    expect(YAML.parse(h.SaveConfig.mock.calls[0][1]).zones.build).toEqual({ rows: 1, position: 2, display: "footer" });
    expect(useAppStore.getState().projects[0].zones?.[0].display).toBe("footer");
  });
});

describe("reorderActions result", () => {
  const move = () => applyMove(startLayout, "test", { group: "footer", index: 1 });

  it("resolves true once the layout is saved", async () => {
    await expect(useAppStore.getState().reorderActions(NAME, move())).resolves.toBe(true);
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it("resolves false after telling the user when the save fails", async () => {
    h.SaveConfig.mockRejectedValue(new Error("disk full"));
    await expect(useAppStore.getState().reorderActions(NAME, move())).resolves.toBe(false);
    expect(h.toastError).toHaveBeenCalledTimes(1);
  });

  it("resolves false for a project the store doesn't have", async () => {
    await expect(useAppStore.getState().reorderActions("gone", move())).resolves.toBe(false);
    expect(h.SaveConfig).not.toHaveBeenCalled();
  });
});
