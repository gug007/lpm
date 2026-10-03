import { beforeEach, describe, expect, it, vi } from "vitest";
import YAML from "yaml";

// vi.mock hoists above any const, so shared state must come from vi.hoisted.
// `then` must stay undefined on the Proxy mocks: a function there makes the
// mocked module thenable and vitest awaits it forever.
const h = vi.hoisted(() => ({
  ReadConfig: vi.fn(),
  SaveConfig: vi.fn(),
  ListProjects: vi.fn(),
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
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { useAppStore } from "./app";
import { editProjectDoc } from "../yamlQueue";
import { removeZone } from "../zoneActions";
import { buildActionsModel } from "../actionsLayoutModel";
import { applyMove } from "../components/actionsDndLayout";
import type { ActionInfo, ProjectInfo } from "../types";

const NAME = "app";

const action = (name: string, display = ""): ActionInfo =>
  ({ name, label: name, cmd: `make ${name}`, confirm: false, display }) as ActionInfo;

const project: ProjectInfo = {
  name: NAME,
  session: NAME,
  root: `/projects/${NAME}`,
  running: false,
  services: [],
  allServices: [],
  actions: [action("test"), action("lint"), action("ios", "build")],
  zones: [{ name: "build", label: "Build", rows: 1, source: "project" }],
  profiles: [],
  activeProfile: "",
  statusEntries: [],
  isRemote: false,
};

const startLayout = buildActionsModel(project.actions, project.zones ?? []).layout;

let file = "";
const onDisk = () => YAML.parse(file);

// A save lands on disk only when it settles, like a slow write would.
function deferNextSave(): () => void {
  let release = () => {};
  h.SaveConfig.mockImplementationOnce(
    (_name: string, content: string) =>
      new Promise<void>((resolve) => {
        release = () => {
          file = content;
          resolve();
        };
      }),
  );
  return () => release();
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  file = `zones:
  build:
    rows: 1
actions:
  test: make test
  lint: make lint
  ios:
    cmd: make ios
    display: build
`;
  h.ReadConfig.mockReset().mockImplementation(async () => file);
  h.SaveConfig.mockReset().mockImplementation(async (_name: string, content: string) => {
    file = content;
  });
  h.ListProjects.mockReset().mockResolvedValue([project]);
  useAppStore.setState({ projects: [project] });
});

describe("writes to one project file", () => {
  it("keeps a drag save that overlaps a zone edit", async () => {
    const release = deferNextSave();
    const edit = editProjectDoc(NAME, (doc) => doc.setIn(["zones", "build", "label"], "Ship"));
    await flush();
    const drag = useAppStore
      .getState()
      .reorderActions(NAME, applyMove(startLayout, "test", { group: "footer", index: 0 }), startLayout);
    await flush();
    release();
    await Promise.all([edit, drag]);
    expect(onDisk().zones.build.label).toBe("Ship");
    expect(onDisk().actions.test.display).toBe("footer");
  });

  it("keeps a zone edit that overlaps a drag save", async () => {
    const release = deferNextSave();
    const drag = useAppStore
      .getState()
      .reorderActions(NAME, applyMove(startLayout, "test", { group: "footer", index: 0 }), startLayout);
    await flush();
    const edit = editProjectDoc(NAME, (doc) => doc.setIn(["zones", "build", "label"], "Ship"));
    await flush();
    release();
    await Promise.all([edit, drag]);
    expect(onDisk().zones.build.label).toBe("Ship");
    expect(onDisk().actions.test.display).toBe("footer");
  });

  it("finishes removing a zone, which saves a reorder then edits the file", async () => {
    await removeZone(NAME, project.zones![0], startLayout);
    expect(onDisk().zones).toBeUndefined();
    expect(onDisk().actions.ios.display).toBe("header");
  });
});
