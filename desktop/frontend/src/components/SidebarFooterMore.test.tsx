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

import { useSettingsStore } from "../store/settings";
import { SidebarFooterMore } from "./SidebarFooterMore";

let container: HTMLDivElement;
let root: Root;

const noop = () => {};

function renderMore(overrides: Partial<Parameters<typeof SidebarFooterMore>[0]> = {}) {
  act(() => {
    root.render(
      <SidebarFooterMore
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

beforeEach(() => {
  mocks.listAllJobs.mockResolvedValue([]);
  useSettingsStore.setState({ hotkeys: undefined });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("SidebarFooterMore", () => {
  it("opens Activity from the menu with its shortcut and status", () => {
    const onActivity = vi.fn();
    renderMore({ needsYou: 2, hasError: true, onActivity });

    expect(container.textContent).not.toContain("Activity");

    act(() => buttonWithText("More")!.click());

    const activity = buttonWithText("Activity");
    expect(activity).toBeDefined();
    expect(activity!.textContent).toContain("⌘⇧A");
    expect(activity!.textContent).toContain("2");

    act(() => activity!.click());
    expect(onActivity).toHaveBeenCalledOnce();
    expect(buttonWithText("Automations")).toBeUndefined();
  });

  it("surfaces waiting agents on the collapsed More button", () => {
    renderMore({ needsYou: 3, hasError: true });

    const more = buttonWithText("More")!;
    expect(more.textContent).toContain("3");
    expect(more.title).toContain("3 agents waiting on you");
    expect(more.title).toContain("an agent hit an error");
  });

  it("fires the Activity shortcut while the menu is closed", () => {
    const onActivity = vi.fn();
    renderMore({ onActivity });

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "A", code: "KeyA", metaKey: true, shiftKey: true, bubbles: true }),
      );
    });

    expect(onActivity).toHaveBeenCalledOnce();
  });
});
