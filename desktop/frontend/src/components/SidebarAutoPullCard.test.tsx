// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OriginStatus } from "../originStatus";
import type { ProjectInfo } from "../types";

const mocks = vi.hoisted(() => ({
  projects: [] as ProjectInfo[],
  settings: { autoPull: "off" } as Record<string, unknown>,
  update: vi.fn(async () => {}),
  openAutoPullSettings: vi.fn(),
  setProjectAutoPull: vi.fn(async () => true),
  autoPullSoon: vi.fn(),
  wait: vi.fn(() => "next"),
  runOriginAction: vi.fn(async () => true),
  toast: vi.fn(),
}));

vi.mock("../../bridge/runtime", () => ({ EventsOn: vi.fn(() => () => {}) }));
vi.mock("../notifications/toast", () => ({ toast: { success: mocks.toast, error: vi.fn() } }));
vi.mock("../store/app", () => ({
  useAppStore: (select: (state: unknown) => unknown) =>
    select({ projects: mocks.projects }),
}));
vi.mock("../store/settings", () => ({
  useSettingsStore: (select: (state: unknown) => unknown) => select({ ...mocks.settings, update: mocks.update }),
}));
vi.mock("../autoPullRun", () => ({
  autoPullSoon: mocks.autoPullSoon,
  autoPullWait: mocks.wait,
  openAutoPullSettings: mocks.openAutoPullSettings,
  setProjectAutoPull: mocks.setProjectAutoPull,
}));
vi.mock("../originActions", () => ({ runOriginAction: mocks.runOriginAction }));

import { OPEN_DELAY_MS } from "../hooks/useHoverPopup";
import { useOriginStatus } from "../store/originStatus";
import { SidebarOriginAction } from "./SidebarOriginAction";
import { SidebarOriginMark } from "./SidebarOriginMark";

const ROOT = "/p/web";

const status = (over: Partial<OriginStatus> = {}): OriginStatus => ({
  branch: "main",
  hasUpstream: true,
  ahead: 0,
  behind: 3,
  base: "",
  baseBehind: 0,
  conflicted: false,
  changes: 0,
  fetched: true,
  ...over,
});

const project = (over: Partial<ProjectInfo> = {}): ProjectInfo =>
  ({ name: "web", root: ROOT, isRemote: false, statusEntries: [], ...over }) as ProjectInfo;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.projects = [project()];
  mocks.settings = { autoPull: "off" };
  mocks.wait.mockReturnValue("next");
  useOriginStatus.getState().reset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const pointerOver = (el: Element) =>
  act(() => {
    document.body.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("pointerover", { bubbles: true, relatedTarget: null }));
    vi.advanceTimersByTime(OPEN_DELAY_MS);
  });

const card = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Auto pull"]');
const button = (text: string) =>
  [...(card()?.querySelectorAll("button") ?? [])].find((b) => b.textContent?.trim() === text)!;

function hoverPull(over: Partial<OriginStatus> = {}) {
  act(() => {
    useOriginStatus.getState().setStatus(ROOT, status(over));
    root.render(<SidebarOriginAction root={ROOT} projectName="web" className="" onResolve={() => {}} />);
  });
  pointerOver(container.querySelector("button")!);
}

describe("the auto pull card on Pull", () => {
  it("offers to turn auto pull on and says where the setting lives", () => {
    hoverPull();
    expect(card()?.textContent).toContain("Origin has 3 new commits on main");
    expect(button("Turn on for all projects")).toBeTruthy();
    expect(button("Only web")).toBeTruthy();
    expect(card()?.textContent).toContain("Settings › Git › Auto pull");
  });

  it("turns it on for every project", () => {
    hoverPull();
    act(() => button("Turn on for all projects").click());
    expect(mocks.update).toHaveBeenCalledWith({ autoPull: "all" });
    expect(mocks.autoPullSoon).toHaveBeenCalled();
    expect(card()).toBeNull();
  });

  it("turns it on for just this project", async () => {
    hoverPull();
    await act(async () => button("Only web").click());
    expect(mocks.update).toHaveBeenCalledWith({ autoPull: "chosen" });
    expect(mocks.setProjectAutoPull).toHaveBeenCalledWith("web", true);
  });

  it("only needs the project's own switch once Settings has it on", async () => {
    mocks.settings = { autoPull: "all" };
    mocks.projects = [project({ autoPull: false })];
    hoverPull();
    expect(card()?.textContent).toContain("turned off for web in its Git menu");
    await act(async () => button("Turn on for web").click());
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.setProjectAutoPull).toHaveBeenCalledWith("web", true);
  });

  it("says why it hasn't pulled when auto pull is already on", () => {
    mocks.settings = { autoPull: "all" };
    mocks.wait.mockReturnValue("agent");
    hoverPull();
    expect(card()?.textContent).toContain("waits for the agent working here to finish");
    expect(card()?.querySelectorAll("button")).toHaveLength(1);
  });

  it("opens Settings › General from the card", () => {
    hoverPull();
    act(() => button("Settings › Git › Auto pull").click());
    expect(mocks.openAutoPullSettings).toHaveBeenCalledOnce();
  });

  it("stays away from Sync and from projects on another machine", () => {
    hoverPull({ ahead: 1 });
    expect(card()).toBeNull();
    mocks.projects = [project({ isRemote: true })];
    hoverPull();
    expect(card()).toBeNull();
  });
});

describe("the auto pull card on a held mark", () => {
  it("opens on the grey mark while uncommitted changes hold the pull", () => {
    mocks.settings = { autoPull: "all" };
    mocks.wait.mockReturnValue("changes");
    act(() => {
      useOriginStatus.getState().setStatus(ROOT, status({ changes: 2 }));
      root.render(<SidebarOriginMark root={ROOT} />);
    });
    pointerOver(container.querySelector("span")!);
    expect(card()?.textContent).toContain("waits while 2 files have uncommitted changes");
  });
});
