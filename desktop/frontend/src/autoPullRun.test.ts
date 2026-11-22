import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OriginStatus } from "./originStatus";
import type { ProjectInfo } from "./types";

const mocks = vi.hoisted(() => ({
  pull: vi.fn(),
  undo: vi.fn(),
  setAutoPull: vi.fn(async () => {}),
  recheck: vi.fn(async () => {}),
  done: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  settings: { autoPull: "all" } as { autoPull?: string },
  projects: [] as ProjectInfo[],
  busy: new Set<string>(),
}));

vi.mock("../bridge/commands", () => ({
  GitAutoPull: mocks.pull,
  GitAutoPullUndo: mocks.undo,
  SetAutoPull: mocks.setAutoPull,
}));
vi.mock("./notifications/toast", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError, dismiss: vi.fn() } }));
vi.mock("./originActions", () => ({ recheckOrigin: mocks.recheck, showOriginDone: mocks.done }));
vi.mock("./store/settings", () => ({ getSettings: () => mocks.settings }));
vi.mock("./store/app", () => ({ useAppStore: { getState: () => ({ projects: mocks.projects }) } }));
vi.mock("./sidebarAgents", () => ({
  agentBusy: (p: ProjectInfo) => mocks.busy.has(p.name),
}));

type Run = typeof import("./autoPullRun");
type Origin = typeof import("./store/originStatus");

// The runner keeps what it has pulled and held per folder; each test gets a
// fresh copy of it and of the store it reads.
let maybeAutoPull: Run["maybeAutoPull"];
let undoAutoPull: Run["undoAutoPull"];
let useOriginStatus: Origin["useOriginStatus"];

const ROOT = "/p/web";

const status = (patch: Partial<OriginStatus> = {}): OriginStatus => ({
  branch: "main",
  hasUpstream: true,
  ahead: 0,
  behind: 3,
  base: "",
  baseBehind: 0,
  conflicted: false,
  changes: 0,
  fetched: true,
  ...patch,
});

const project = (over: Partial<ProjectInfo> = {}): ProjectInfo =>
  ({ name: "web", root: ROOT, isRemote: false, statusEntries: [], ...over }) as ProjectInfo;

const PULLED = { kind: "pulled", branch: "main", count: 3, from: "a1b2c3d", to: "9f8e7d6", at: 1 };

beforeEach(async () => {
  vi.resetModules();
  ({ maybeAutoPull, undoAutoPull } = await import("./autoPullRun"));
  ({ useOriginStatus } = await import("./store/originStatus"));
  vi.clearAllMocks();
  mocks.settings.autoPull = "all";
  mocks.projects = [project()];
  mocks.busy.clear();
  mocks.pull.mockResolvedValue(PULLED);
  useOriginStatus.getState().reset();
  useOriginStatus.getState().setStatus(ROOT, status());
});

describe("maybeAutoPull", () => {
  it("pulls a clean branch that's behind, confirms on the row and offers Undo", async () => {
    await maybeAutoPull(ROOT);
    expect(mocks.pull).toHaveBeenCalledWith(ROOT);
    expect(mocks.done).toHaveBeenCalledWith(ROOT, "Pulled 3");
    expect(useOriginStatus.getState().entries[ROOT].running).toBe(false);
    const [title, options] = mocks.toastSuccess.mock.calls[0];
    expect(title).toBe("Pulled 3 commits into web");
    expect(options.action.label).toBe("Undo");
  });

  it("shows what Undo did in a note of its own", async () => {
    mocks.undo.mockResolvedValue(PULLED);
    await maybeAutoPull(ROOT);
    const pulled = mocks.toastSuccess.mock.calls[0][1];
    pulled.action.onClick({ preventDefault: vi.fn() });
    await vi.waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledTimes(2));
    const [title, options] = mocks.toastSuccess.mock.calls[1];
    expect(title).toBe("Undid the pull in web");
    expect(options.id).not.toBe(pulled.id);
    expect(options.action.label).toBe("Turn off auto pull");
  });

  it("leaves branches that are ahead, have changes or conflicts to the user", async () => {
    for (const patch of [{ ahead: 1 }, { changes: 2 }, { conflicted: true }, { behind: 0 }]) {
      useOriginStatus.getState().setStatus(ROOT, status(patch));
      await maybeAutoPull(ROOT);
    }
    expect(mocks.pull).not.toHaveBeenCalled();
  });

  it("follows the settings: off everywhere, opted out, or only chosen projects", async () => {
    mocks.settings.autoPull = "off";
    await maybeAutoPull(ROOT);
    mocks.settings.autoPull = "all";
    mocks.projects = [project({ autoPull: false })];
    await maybeAutoPull(ROOT);
    mocks.settings.autoPull = "chosen";
    mocks.projects = [project()];
    await maybeAutoPull(ROOT);
    expect(mocks.pull).not.toHaveBeenCalled();

    mocks.projects = [project({ autoPull: true })];
    await maybeAutoPull(ROOT);
    expect(mocks.pull).toHaveBeenCalledTimes(1);
  });

  it("gives a copy its parent's choice", async () => {
    mocks.projects = [
      project({ name: "web", root: "/p/web-main", autoPull: false }),
      project({ name: "web-2", parentName: "web" }),
    ];
    await maybeAutoPull(ROOT);
    expect(mocks.pull).not.toHaveBeenCalled();
  });

  it("waits while an agent is working in the project", async () => {
    mocks.busy.add("web");
    await maybeAutoPull(ROOT);
    expect(mocks.pull).not.toHaveBeenCalled();
    mocks.busy.clear();
    await maybeAutoPull(ROOT);
    expect(mocks.pull).toHaveBeenCalledTimes(1);
  });

  it("skips projects on another Mac or an SSH host", async () => {
    const peer = "/@peer-aabbccdd/Users/g/web";
    mocks.projects = [project({ root: peer }), project({ name: "box", root: "/srv/box", isRemote: true })];
    useOriginStatus.getState().setStatus(peer, status());
    useOriginStatus.getState().setStatus("/srv/box", status());
    await maybeAutoPull(peer);
    await maybeAutoPull("/srv/box");
    expect(mocks.pull).not.toHaveBeenCalled();
  });

  it("reports a refused pull once and tries again only after origin moves", async () => {
    mocks.pull.mockRejectedValue("untracked config/local.json would be overwritten");
    await maybeAutoPull(ROOT);
    await maybeAutoPull(ROOT);
    expect(mocks.pull).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).toHaveBeenCalledTimes(1);

    useOriginStatus.getState().setStatus(ROOT, status({ behind: 4 }));
    await maybeAutoPull(ROOT);
    expect(mocks.pull).toHaveBeenCalledTimes(2);
  });

  it("stays quiet when the Mac finds a reason not to pull", async () => {
    mocks.pull.mockResolvedValue({ kind: "skipped", reason: "changes" });
    await maybeAutoPull(ROOT);
    expect(mocks.done).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
});

describe("undoAutoPull", () => {
  it("takes the pull back and holds off until origin moves", async () => {
    mocks.undo.mockResolvedValue(PULLED);
    await undoAutoPull(ROOT, "web", "web");
    expect(mocks.undo).toHaveBeenCalledWith(ROOT);
    const [title, options] = mocks.toastSuccess.mock.calls[0];
    expect(title).toBe("Undid the pull in web");
    expect(options.action.label).toBe("Turn off auto pull");

    await maybeAutoPull(ROOT);
    expect(mocks.pull).not.toHaveBeenCalled();
    useOriginStatus.getState().setStatus(ROOT, status({ behind: 5 }));
    await maybeAutoPull(ROOT);
    expect(mocks.pull).toHaveBeenCalledTimes(1);
  });

  it("says why when the branch has moved since", async () => {
    mocks.undo.mockRejectedValue("This auto pull can't be undone: the branch has moved since.");
    await undoAutoPull(ROOT, "web", "web");
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });
});
