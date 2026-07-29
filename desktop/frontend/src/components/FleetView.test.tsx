// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectInfo, StatusEntry } from "../types";

const mocks = vi.hoisted(() => ({
  listAllJobs: vi.fn(),
  clearStatus: vi.fn(),
  selectProject: vi.fn(),
  focusProjectTerminal: vi.fn(),
  toggleService: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  openAutomations: vi.fn(),
  projects: [] as ProjectInfo[],
  peerState: { state: { peers: [] }, refresh: vi.fn() },
  peerAliases: {} as Record<string, string>,
}));

vi.mock("../../bridge/commands", () => ({
  ListAllJobs: mocks.listAllJobs,
  ClearStatus: mocks.clearStatus,
}));
vi.mock("../../bridge/runtime", () => ({ EventsOn: vi.fn(() => () => {}) }));
vi.mock("sonner", () => ({
  toast: { info: mocks.info, error: mocks.error },
}));
vi.mock("../store/app", () => ({
  useAppStore: (select: (state: unknown) => unknown) =>
    select({
      projects: mocks.projects,
      selectProject: mocks.selectProject,
      focusProjectTerminal: mocks.focusProjectTerminal,
      toggleService: mocks.toggleService,
    }),
}));
vi.mock("../peer/usePeerState", () => ({
  usePeerState: () => mocks.peerState,
  peerAliasMap: () => mocks.peerAliases,
}));

import { FleetView } from "./FleetView";
import { FLEET_RESETTLE_MS } from "../useFleetOrder";

const T0 = 1_700_000_000_000;

function project(name: string, entries: StatusEntry[]): ProjectInfo {
  return {
    name,
    session: name,
    root: `/Users/dev/${name}`,
    running: false,
    services: [],
    allServices: [],
    actions: [],
    profiles: [],
    activeProfile: "",
    statusEntries: entries,
    isRemote: false,
  };
}

function entry(key: string, value: string, timestamp = T0): StatusEntry {
  return { key, value, priority: 0, timestamp, paneID: `pty-${key}` };
}

let container: HTMLDivElement;
let root: Root;

async function render() {
  await act(async () => {
    root.render(<FleetView onOpenAutomations={mocks.openAutomations} />);
  });
}

function flat(node: Element | null): string {
  return (node?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function rowText(): string[] {
  return [...container.querySelectorAll('[role="option"]')].map(flat);
}

function groupHeaderText(): string[] {
  return [...container.querySelectorAll("section")].map((section) =>
    flat(section.firstElementChild),
  );
}

function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find((el) =>
    (el.textContent ?? "").includes(label),
  );
}

function press(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

beforeEach(() => {
  mocks.listAllJobs.mockResolvedValue([]);
  mocks.clearStatus.mockResolvedValue(undefined);
  mocks.info.mockClear();
  mocks.clearStatus.mockClear();
  mocks.focusProjectTerminal.mockClear();
  mocks.selectProject.mockClear();
  mocks.openAutomations.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("FleetView", () => {
  it("lists what blocks the user first", async () => {
    mocks.projects = [
      project("api", [entry("claude_code_a", "Running")]),
      project("web", [entry("codex_b", "Waiting")]),
    ];
    await render();
    expect(rowText()[0]).toContain("Needs you");
    expect(rowText()[1]).toContain("Working");
  });

  it("holds the order while a row is selected", async () => {
    mocks.projects = [project("api", [entry("claude_code_a", "Running")])];
    await render();
    press("j");
    expect(rowText()).toHaveLength(1);

    mocks.projects = [
      project("api", [entry("claude_code_a", "Running")]),
      project("web", [entry("codex_b", "Waiting")]),
    ];
    await render();

    // Unfrozen, the approval would take the top row out from under Enter.
    expect(rowText()[0]).toContain("Working");
    expect(rowText()[1]).toContain("Needs you");
  });

  it("opens the project and the terminal behind the selected row", async () => {
    mocks.projects = [project("api", [entry("claude_code_a", "Waiting")])];
    await render();
    press("j");
    press("Enter");
    expect(mocks.focusProjectTerminal).toHaveBeenCalledWith(
      "api",
      "pty-claude_code_a",
    );
  });

  it("explains why a waiting row cannot be dismissed", async () => {
    mocks.projects = [project("api", [entry("claude_code_a", "Waiting")])];
    await render();
    press("j");
    press(" ");
    expect(mocks.clearStatus).not.toHaveBeenCalled();
    expect(mocks.info).toHaveBeenCalledWith(expect.stringContaining("asking for you"));
  });

  it("dismisses a done row", async () => {
    mocks.projects = [project("api", [entry("claude_code_a", "Done")])];
    await render();
    press("j");
    press(" ");
    expect(mocks.clearStatus).toHaveBeenCalledWith(
      "api",
      "pty-claude_code_a",
      "Done",
    );
  });

  it("names the agents and terminals it cannot see", async () => {
    mocks.projects = [project("api", [entry("claude_code_a", "Running")])];
    await render();
    const page = flat(container);
    expect(page).toContain("Gemini and OpenCode don't report back");
    expect(page).toContain("anything you start in Terminals");
  });
});

describe("FleetView holds", () => {
  async function holdWithAnApprovalWaiting() {
    mocks.projects = [project("api", [entry("claude_code_a", "Running")])];
    await render();
    press("j");
    mocks.projects = [
      project("api", [entry("claude_code_a", "Running")]),
      project("web", [entry("codex_b", "Waiting")]),
    ];
    await render();
    expect(rowText()[0]).toContain("Working");
  }

  it("releases the held order when the app loses focus", async () => {
    await holdWithAnApprovalWaiting();
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(rowText()[0]).toContain("Needs you");
  });

  it("releases the held order once the keyboard goes quiet", async () => {
    vi.useFakeTimers();
    try {
      await holdWithAnApprovalWaiting();
      await act(async () => {
        vi.advanceTimersByTime(FLEET_RESETTLE_MS + 100);
      });
      expect(rowText()[0]).toContain("Needs you");
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers to re-sort while a row that belongs higher is pinned below", async () => {
    await holdWithAnApprovalWaiting();
    const sort = button("sort now");
    expect(sort).toBeTruthy();
    await act(async () => {
      sort?.click();
    });
    expect(button("sort now")).toBeUndefined();
    expect(rowText()[0]).toContain("Needs you");
  });

  it("stays quiet when the held order is still the attention order", async () => {
    mocks.projects = [project("api", [entry("claude_code_a", "Waiting")])];
    await render();
    press("j");
    await render();
    expect(button("sort now")).toBeUndefined();
  });
});

describe("FleetView project identity", () => {
  const remote = (): ProjectInfo => ({
    ...project("api", [entry("claude_code_a", "Running")]),
    isRemote: true,
  });

  it("badges the row itself while the list is flat", async () => {
    mocks.projects = [remote()];
    await render();
    expect(rowText()[0]).toContain("SSH");
  });

  it("moves the badges onto the header once grouped", async () => {
    mocks.projects = [remote()];
    await render();
    press("g");
    expect(groupHeaderText()[0]).toContain("SSH");
    expect(rowText()[0]).not.toContain("SSH");
  });
});

describe("FleetView automations", () => {
  const spanning = {
    id: "sweep",
    label: "Nightly sweep",
    valid: true,
    enabled: true,
    running: true,
    targets: ["api", "web"],
    targetCount: 2,
    runningCount: 1,
  };

  it("heads a job spanning projects with the job, not one of its targets", async () => {
    mocks.projects = [project("api", []), project("web", [])];
    mocks.listAllJobs.mockResolvedValue([spanning]);
    await render();
    expect(rowText()[0]).toContain("Nightly sweep");
    expect(rowText()[0]).toContain("Running in 1 of 2 projects");
    expect(rowText()[0]).not.toContain("api");
  });

  it("opens the automations list rather than one of the job's projects", async () => {
    mocks.projects = [project("api", []), project("web", [])];
    mocks.listAllJobs.mockResolvedValue([spanning]);
    await render();
    press("j");
    press("Enter");
    expect(mocks.openAutomations).toHaveBeenCalled();
    expect(mocks.selectProject).not.toHaveBeenCalled();
    expect(mocks.focusProjectTerminal).not.toHaveBeenCalled();
  });
});
