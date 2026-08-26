// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listAllJobs: vi.fn(),
}));

vi.mock("../../bridge/commands", () => ({
  ListAllJobs: mocks.listAllJobs,
}));
vi.mock("../../bridge/runtime", () => ({
  EventsOn: vi.fn(() => () => {}),
}));

import type { Settings } from "../store/settings";
import { useSettingsStore } from "../store/settings";
import { SidebarFooterNav } from "./SidebarFooterNav";

let container: HTMLDivElement;
let root: Root;

const noop = () => {};

function renderNav(overrides: Partial<Parameters<typeof SidebarFooterNav>[0]> = {}) {
  act(() => {
    root.render(
      <SidebarFooterNav
        showTerminals={false}
        onTerminals={noop}
        showActivity={false}
        onActivity={noop}
        needsYou={0}
        hasError={false}
        showScheduled={false}
        onScheduled={noop}
        showUsage={false}
        onUsage={noop}
        showStats={false}
        onStats={noop}
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

beforeEach(() => {
  mocks.listAllJobs.mockResolvedValue([]);
  useSettingsStore.setState({
    hotkeys: undefined,
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
  it("opens Activity from the menu with its shortcut and status", () => {
    const onActivity = vi.fn();
    renderNav({ needsYou: 2, hasError: true, onActivity });

    expect(container.textContent).not.toContain("Activity");

    openMore();

    const activity = buttonWithText("Activity");
    expect(activity).toBeDefined();
    expect(activity!.textContent).toContain("⌘⇧A");
    expect(activity!.textContent).toContain("2");

    act(() => activity!.click());
    expect(onActivity).toHaveBeenCalledOnce();
    expect(buttonWithText("Automations")).toBeUndefined();
  });

  it("surfaces waiting agents on the collapsed More button", () => {
    renderNav({ needsYou: 3, hasError: true });

    const more = moreButton()!;
    expect(more.textContent).toContain("3");
    expect(more.title).toContain("3 agents waiting on you");
    expect(more.title).toContain("an agent hit an error");
  });

  it("fires the Activity shortcut while the menu is closed", () => {
    const onActivity = vi.fn();
    renderNav({ onActivity });

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "A", code: "KeyA", metaKey: true, shiftKey: true, bubbles: true }),
      );
    });

    expect(onActivity).toHaveBeenCalledOnce();
  });

  it("starts with Terminals as the only row outside the menu", () => {
    renderNav();

    expect(buttonWithText("Terminals")).toBeDefined();
    expect(buttonWithText("Stats")).toBeUndefined();
    expect(buttonWithText("Reset to default")).toBeUndefined();
  });

  it("moves a menu row into the sidebar and leaves it out of the menu", () => {
    const onStats = vi.fn();
    renderNav({ onStats });

    openMore();
    openRowMenu("Stats");
    pick("Move to the sidebar");

    expect(useSettingsStore.getState().sidebarNavInSidebar).toEqual(["terminals", "stats"]);

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
    expect(useSettingsStore.getState().sidebarNavInSidebar).toEqual([]);
    expect(buttonWithText("Terminals")).toBeUndefined();

    openMore();
    expect(buttonWithText("Terminals")).toBeDefined();
  });

  it("hands a moved row's badge over to the sidebar so the More button stops counting it", () => {
    renderNav({ needsYou: 4 });

    expect(moreButton()!.textContent).toContain("4");

    openMore();
    openRowMenu("Activity");
    pick("Move to the sidebar");

    const more = moreButton()!;
    expect(more.textContent).not.toContain("4");
    expect(more.title).not.toContain("waiting on you");
    expect(buttonWithText("Activity")!.textContent).toContain("4");
  });

  it("resets the layout from the menu", () => {
    renderNav();

    openMore();
    openRowMenu("Stats");
    pick("Move to the sidebar");
    openRowMenu("Usage");
    pick("Move to the sidebar");
    expect(useSettingsStore.getState().sidebarNavInSidebar).toEqual(["terminals", "usage", "stats"]);

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
        "activity",
        "automations",
        "usage",
        "stats",
        "mobile",
        "settings",
        "feedback",
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
