// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listAllJobs: vi.fn(),
  browserOpenURL: vi.fn(),
  keepAwakeState: vi.fn(),
  keepAwakeSet: vi.fn(),
  keepAwakeSetPrefs: vi.fn(),
}));

vi.mock("../../bridge/commands", () => ({
  ListAllJobs: mocks.listAllJobs,
  GetProject: vi.fn(),
  ListPortsOverview: vi.fn(),
  KeepAwakeState: mocks.keepAwakeState,
  KeepAwakeSet: mocks.keepAwakeSet,
  KeepAwakeSetPrefs: mocks.keepAwakeSetPrefs,
  PeerInvoke: vi.fn(),
}));
vi.mock("../../bridge/runtime", () => ({
  EventsOn: vi.fn(() => () => {}),
  BrowserOpenURL: mocks.browserOpenURL,
}));

import { useCollapsedAgents } from "../sidebarCollapsed";
import { useGlobalAgentStatus } from "../store/globalAgentStatus";
import type { Settings } from "../store/settings";
import { useSettingsStore } from "../store/settings";
import { useTerminalTitles } from "../store/terminalTitles";
import { STATUS_ERROR, STATUS_RUNNING, STATUS_WAITING, type StatusEntry } from "../types";
import { SidebarFooterNav } from "./SidebarFooterNav";

function entry(value: string, paneID?: string): StatusEntry {
  return { key: `claude_code_${paneID ?? "loose"}`, value, priority: 0, timestamp: Date.now(), paneID };
}

let container: HTMLDivElement;
let root: Root;

const noop = () => {};

function renderNav(overrides: Partial<Parameters<typeof SidebarFooterNav>[0]> = {}) {
  act(() => {
    root.render(
      <SidebarFooterNav
        showTerminals={false}
        onTerminals={noop}
        onOpenTerminalTab={noop}
        showScheduled={false}
        onScheduled={noop}
        showUsage={false}
        onUsage={noop}
        showStats={false}
        onStats={noop}
        showPorts={false}
        onPorts={noop}
        showMobile={false}
        onMobile={noop}
        showSettings={false}
        onSettings={noop}
        onFeedback={noop}
        {...overrides}
      />,
    );
  });
}

function buttonWithText(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  ) as HTMLButtonElement | undefined;
}

function byLabel(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find(
    (b) => b.getAttribute("aria-label") === label,
  ) as HTMLButtonElement | undefined;
}

const moreButton = () => byLabel("More");
const openMore = () => act(() => moreButton()!.click());
// The row's options button opens the menu that holds the move and reset actions.
const openRowMenu = (label: string) =>
  act(() => byLabel(`More options for ${label}`)!.click());
const pick = (text: string) => act(() => buttonWithText(text)!.click());

const KEEP_AWAKE = {
  supported: true,
  screenSupported: true,
  mode: "off",
  active: false,
  agents: 0,
  endsIn: null,
  tailMinutes: 5,
  screen: false,
  battery: true,
  floor: 20,
  power: "idle",
};

beforeEach(() => {
  mocks.listAllJobs.mockResolvedValue([]);
  mocks.keepAwakeState.mockResolvedValue(KEEP_AWAKE);
  mocks.keepAwakeSet.mockResolvedValue(KEEP_AWAKE);
  mocks.keepAwakeSetPrefs.mockResolvedValue(KEEP_AWAKE);
  useGlobalAgentStatus.setState({ entries: [] });
  useTerminalTitles.setState({ byProject: {}, focusedByProject: {} });
  useCollapsedAgents.setState({ collapsed: new Set() });
  useSettingsStore.setState({
    sidebarNavInSidebar: undefined,
    // Persistence goes through the bridge; here it just has to round-trip.
    update: async (partial: Partial<Settings>) => {
      useSettingsStore.setState(partial);
    },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("SidebarFooterNav", () => {
  it("opens lpm's GitHub repo from the Star on GitHub row", () => {
    renderNav();
    openMore();
    pick("Star on GitHub");

    expect(mocks.browserOpenURL).toHaveBeenCalledWith("https://github.com/gug007/lpm");
  });

  it("opens Support & Feedback from the icon beside More, not from the menu", () => {
    const onFeedback = vi.fn();
    renderNav({ onFeedback });

    act(() => byLabel("Support & Feedback")!.click());
    expect(onFeedback).toHaveBeenCalledTimes(1);

    openMore();
    expect(buttonWithText("Support & Feedback")).toBeUndefined();
  });

  it("starts with Terminals and Keep awake as the only rows outside the menu", () => {
    renderNav();

    expect(buttonWithText("Terminals")).toBeDefined();
    expect(buttonWithText("Keep awake")).toBeDefined();
    expect(buttonWithText("Stats")).toBeUndefined();
    expect(buttonWithText("Reset to default")).toBeUndefined();
  });

  it("moves a menu row into the sidebar and leaves it out of the menu", () => {
    const onStats = vi.fn();
    renderNav({ onStats });

    openMore();
    openRowMenu("Stats");
    pick("Move to the sidebar");

    expect(useSettingsStore.getState().sidebarNavInSidebar).toEqual(["terminals", "awake", "stats"]);

    // Now a sidebar row: reachable with the menu shut, and gone from it.
    act(() => moreButton()!.click());
    const stats = buttonWithText("Stats");
    expect(stats).toBeDefined();
    act(() => stats!.click());
    expect(onStats).toHaveBeenCalledOnce();

    openMore();
    expect([...container.querySelectorAll("button")].filter((b) => b.textContent?.includes("Stats"))).toHaveLength(1);
  });

  it("moves a sidebar row back into the menu", () => {
    renderNav();

    openRowMenu("Terminals");
    pick("Move to the More menu");
    expect(useSettingsStore.getState().sidebarNavInSidebar).toEqual(["awake"]);
    expect(buttonWithText("Terminals")).toBeUndefined();

    openMore();
    expect(buttonWithText("Terminals")).toBeDefined();
  });

  it("hands a moved row's badge over to the sidebar so the More button stops counting it", async () => {
    mocks.listAllJobs.mockResolvedValue([{ unread: 1 }, { unread: 2 }, { unread: 0 }]);
    renderNav();
    await act(async () => {});

    expect(moreButton()!.textContent).toContain("2");
    expect(moreButton()!.title).toContain("2 automations with new messages");

    openMore();
    openRowMenu("Automations");
    pick("Move to the sidebar");

    const more = moreButton()!;
    expect(more.textContent).not.toContain("2");
    expect(more.title).not.toContain("new messages");
    expect(buttonWithText("Automations")!.textContent).toContain("2");
  });

  it("resets the layout from the menu", () => {
    renderNav();

    openMore();
    openRowMenu("Stats");
    pick("Move to the sidebar");
    openRowMenu("Usage");
    pick("Move to the sidebar");
    expect(useSettingsStore.getState().sidebarNavInSidebar).toEqual([
      "terminals",
      "awake",
      "usage",
      "stats",
    ]);

    // The menu stays open across moves, so Reset is right there.
    pick("Reset to default");

    expect(useSettingsStore.getState().sidebarNavInSidebar).toBeUndefined();
    expect(buttonWithText("Terminals")).toBeDefined();
    expect(buttonWithText("Stats")).toBeUndefined();
  });

  it("drops the More button once every row is in the sidebar, and resets from a row", () => {
    useSettingsStore.setState({
      sidebarNavInSidebar: [
        "terminals",
        "awake",
        "automations",
        "usage",
        "stats",
        "ports",
        "recap",
        "mobile",
        "settings",
        "github",
      ],
    });
    renderNav();

    expect(moreButton()).toBeUndefined();

    // Right-click reaches the same menu as the row's options button.
    act(() => {
      buttonWithText("Stats")!.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 20, clientY: 20 }),
      );
    });
    pick("Reset to default");

    expect(useSettingsStore.getState().sidebarNavInSidebar).toBeUndefined();
    expect(moreButton()).toBeDefined();
  });
});

describe("SidebarFooterNav Keep awake", () => {
  it("shows how many agents keep the machine awake", async () => {
    mocks.keepAwakeState.mockResolvedValue({ ...KEEP_AWAKE, mode: "agents", active: true, agents: 2 });
    renderNav();
    await act(async () => {});

    expect(buttonWithText("Keep awake")!.textContent).toContain("2 agents");
  });

  it("counts down a set time on the row", async () => {
    mocks.keepAwakeState.mockResolvedValue({ ...KEEP_AWAKE, mode: "timed", active: true, endsIn: 90 * 60_000 });
    renderNav();
    await act(async () => {});

    expect(buttonWithText("Keep awake")!.textContent).toMatch(/1:(30|29):\d\d/);
  });

  it("opens its menu from the row and turns it on until turned off", async () => {
    renderNav();
    await act(async () => {});

    act(() => buttonWithText("Keep awake")!.click());
    const always = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Until I turn it off"),
    )!;
    expect(always).toBeDefined();
    await act(async () => always.click());

    expect(mocks.keepAwakeSet).toHaveBeenCalledWith("always", undefined);
  });

  it("starts a set time from a preset", async () => {
    renderNav();
    await act(async () => {});

    act(() => buttonWithText("Keep awake")!.click());
    const twoHours = [...document.querySelectorAll("button")].find((b) => b.textContent === "2h")!;
    await act(async () => twoHours.click());

    expect(mocks.keepAwakeSet).toHaveBeenCalledWith("timed", 120);
  });

  const menuButton = (text: string) =>
    [...document.querySelectorAll("[data-context-menu] button")].find((b) => b.textContent === text) as
      | HTMLButtonElement
      | undefined;

  it("starts nothing from the For a set time heading, and opens Custom… on demand", async () => {
    renderNav();
    await act(async () => {});
    act(() => buttonWithText("Keep awake")!.click());

    expect(menuButton("For a set time")).toBeUndefined();
    expect(document.querySelector('[data-context-menu] input[aria-label="Hours"]')).toBeNull();
    act(() => menuButton("Custom…")!.click());
    expect(document.querySelector('[data-context-menu] input[aria-label="Hours"]')).not.toBeNull();
    expect(mocks.keepAwakeSet).not.toHaveBeenCalled();
  });

  it("offers the extra time after agents as chips, only while waiting on agents", async () => {
    renderNav();
    await act(async () => {});
    act(() => buttonWithText("Keep awake")!.click());
    expect(menuButton("15m")).toBeUndefined();
    act(() => root.unmount());

    mocks.keepAwakeState.mockResolvedValue({ ...KEEP_AWAKE, mode: "agents", active: true, agents: 1 });
    root = createRoot(container);
    renderNav();
    await act(async () => {});
    act(() => buttonWithText("Keep awake")!.click());
    await act(async () => menuButton("15m")!.click());

    expect(mocks.keepAwakeSetPrefs).toHaveBeenCalledWith({ tailMinutes: 15 });
  });

  it("closes its menu when the row is clicked again", async () => {
    renderNav();
    await act(async () => {});
    const row = buttonWithText("Keep awake")!;
    act(() => row.click());
    expect(document.querySelector("[data-context-menu]")).not.toBeNull();

    act(() => {
      row.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      row.click();
    });
    expect(document.querySelector("[data-context-menu]")).toBeNull();
  });

  it("has no row on a machine that can't be kept awake", async () => {
    mocks.keepAwakeState.mockResolvedValue({ ...KEEP_AWAKE, supported: false, power: "unsupported" });
    renderNav();
    await act(async () => {});

    expect(buttonWithText("Keep awake")).toBeUndefined();
    openMore();
    expect(buttonWithText("Keep awake")).toBeUndefined();
  });

  const hoverRow = async () => {
    act(() => {
      buttonWithText("Keep awake")!.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }),
      );
    });
    await act(async () => vi.advanceTimersByTime(600));
  };
  const cardButton = (text: string) =>
    [...document.querySelectorAll("button")].find((b) => b.textContent === text && !b.closest("[data-context-menu]"));

  it("rests on the row to add an hour without the menu", async () => {
    vi.useFakeTimers();
    try {
      mocks.keepAwakeState.mockResolvedValue({ ...KEEP_AWAKE, mode: "timed", active: true, endsIn: 20 * 60_000 });
      renderNav();
      await act(async () => {});
      await hoverRow();

      expect(document.body.textContent).toContain("Kept awake");
      await act(async () => cardButton("+1 h")!.click());
      expect(mocks.keepAwakeSet).toHaveBeenCalledWith("extend", 60);
      expect(document.querySelector("[data-context-menu]")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("turns off from the card, which has no hour to add while agents work", async () => {
    vi.useFakeTimers();
    try {
      mocks.keepAwakeState.mockResolvedValue({ ...KEEP_AWAKE, mode: "agents", active: true, agents: 1 });
      renderNav();
      await act(async () => {});
      await hoverRow();

      expect(cardButton("+1 h")).toBeUndefined();
      await act(async () => cardButton("Turn off")!.click());
      expect(mocks.keepAwakeSet).toHaveBeenCalledWith("off", undefined);
    } finally {
      vi.useRealTimers();
    }
  });

  it("explains itself on hover while off", async () => {
    vi.useFakeTimers();
    try {
      renderNav();
      await act(async () => {});
      await hoverRow();

      expect(document.querySelector('[role="tooltip"]')?.textContent).toContain("while agents work");
      expect(cardButton("Turn off")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks the More button while a row in it keeps the machine awake", async () => {
    useSettingsStore.setState({ sidebarNavInSidebar: ["terminals"] });
    mocks.keepAwakeState.mockResolvedValue({ ...KEEP_AWAKE, mode: "always", active: true, power: "awake" });
    renderNav();
    await act(async () => {});

    expect(moreButton()!.title).toContain("kept awake");
  });
});

describe("SidebarFooterNav Terminals agents", () => {
  const seed = (entries: StatusEntry[], titles: Record<string, string> = {}) => {
    useGlobalAgentStatus.setState({ entries });
    useTerminalTitles.setState({ byProject: { __global__: titles } });
  };

  it("lists the tabs and leaves the working shimmer to them", () => {
    const onOpenTerminalTab = vi.fn();
    seed([entry(STATUS_RUNNING, "t1")], { t1: "Mac storage" });
    renderNav({ onOpenTerminalTab });

    const terminals = buttonWithText("Terminals")!;
    expect(terminals.querySelector(".sidebar-shimmer")).toBeNull();

    const tab = buttonWithText("Mac storage");
    expect(tab?.querySelector(".sidebar-shimmer")?.textContent).toBe("Mac storage");
    act(() => tab!.click());
    expect(onOpenTerminalTab).toHaveBeenCalledWith("t1");
  });

  it("leaves a wait to its rows until they fold, and names a problem on the row", () => {
    seed([entry(STATUS_WAITING, "t1"), entry(STATUS_ERROR, "t2")]);
    renderNav();

    const terminals = buttonWithText("Terminals")!;
    expect(terminals.querySelector(".sidebar-waiting")).toBeNull();
    expect(terminals.textContent).toContain("Problem");

    act(() => byLabel("Hide agents in Terminals")!.click());
    expect(buttonWithText("Terminals")!.querySelector(".sidebar-waiting")?.textContent).toBe(
      "Terminals",
    );
  });

  it("sends an agent with no tab to the Terminals view", () => {
    const onTerminals = vi.fn();
    const onOpenTerminalTab = vi.fn();
    seed([entry(STATUS_RUNNING)]);
    renderNav({ onTerminals, onOpenTerminalTab });

    act(() => buttonWithText("Claude Code")!.click());
    expect(onTerminals).toHaveBeenCalledOnce();
    expect(onOpenTerminalTab).not.toHaveBeenCalled();
  });

  it("folds the list away from the chevron and remembers it", () => {
    seed([entry(STATUS_RUNNING, "t1")], { t1: "Mac storage" });
    renderNav();

    act(() => byLabel("Hide agents in Terminals")!.click());
    expect(buttonWithText("Mac storage")).toBeUndefined();
    expect(useCollapsedAgents.getState().collapsed.has("__global__")).toBe(true);
    expect(buttonWithText("Terminals")!.querySelector(".sidebar-shimmer")?.textContent).toBe(
      "Terminals",
    );

    act(() => byLabel("Show agents in Terminals")!.click());
    expect(buttonWithText("Mac storage")).toBeDefined();
  });

  it("keeps the list out of the More menu but the label's state in it", () => {
    seed([entry(STATUS_RUNNING, "t1")], { t1: "Mac storage" });
    useSettingsStore.setState({ sidebarNavInSidebar: [] });
    renderNav();

    openMore();
    const terminals = buttonWithText("Terminals")!;
    expect(terminals.querySelector(".sidebar-shimmer")).not.toBeNull();
    expect(buttonWithText("Mac storage")).toBeUndefined();
  });

  it("shows a plain row while no agent reports", () => {
    renderNav();

    const terminals = buttonWithText("Terminals")!;
    expect(terminals.querySelector(".sidebar-shimmer")).toBeNull();
    expect(byLabel("Hide agents in Terminals")).toBeUndefined();
  });
});
