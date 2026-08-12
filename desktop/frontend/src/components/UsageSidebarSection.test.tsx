// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock("../../bridge/commands", () => ({
  LoadSettings: mocks.loadSettings,
  SaveSettings: mocks.saveSettings,
}));

import { useSettingsStore } from "../store/settings";
import { UsageSidebarSection } from "./UsageSidebarSection";

let container: HTMLDivElement;
let root: Root;

function chip(label: string): HTMLButtonElement {
  return [...container.querySelectorAll("button")].find(
    (b) => b.getAttribute("role") === "switch" && b.textContent?.trim() === label,
  ) as HTMLButtonElement;
}

function segment(label: string): HTMLButtonElement {
  return [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label && b.hasAttribute("aria-pressed"),
  ) as HTMLButtonElement;
}

async function render(tokens = 0) {
  await act(async () => {
    root.render(<UsageSidebarSection tokensToday={tokens} />);
  });
}

async function click(button: HTMLButtonElement) {
  await act(async () => {
    button.click();
  });
}

beforeEach(() => {
  mocks.loadSettings.mockResolvedValue({});
  mocks.saveSettings.mockResolvedValue(undefined);
  useSettingsStore.setState({
    usageInSidebar: true,
    usageSidebarTools: undefined,
    usageSidebarWindow: undefined,
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

describe("UsageSidebarSection", () => {
  it("starts with both tools on and the weekly window", async () => {
    await render();
    expect(chip("Claude").getAttribute("aria-checked")).toBe("true");
    expect(chip("Codex").getAttribute("aria-checked")).toBe("true");
    expect(segment("Weekly").getAttribute("aria-pressed")).toBe("true");
  });

  it("turns one tool off and leaves the other on", async () => {
    await render();
    await click(chip("Claude"));

    expect(useSettingsStore.getState().usageSidebarTools).toEqual(["codex"]);
    expect(mocks.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ usageSidebarTools: ["codex"] }),
    );
    expect(chip("Claude").getAttribute("aria-checked")).toBe("false");
    expect(chip("Codex").getAttribute("aria-checked")).toBe("true");
  });

  it("turns a tool back on without dropping the other", async () => {
    useSettingsStore.setState({ usageSidebarTools: ["codex"] });
    await render();
    await click(chip("Claude"));

    expect(useSettingsStore.getState().usageSidebarTools).toEqual(["claude", "codex"]);
  });

  it("lets both tools be turned off", async () => {
    useSettingsStore.setState({ usageSidebarTools: ["codex"] });
    await render();
    await click(chip("Codex"));

    expect(useSettingsStore.getState().usageSidebarTools).toEqual([]);
  });

  it("persists the window choice", async () => {
    await render();
    await click(segment("5-hour"));

    expect(useSettingsStore.getState().usageSidebarWindow).toBe("fiveHour");
  });

  it("locks the options while the sidebar block is off", async () => {
    useSettingsStore.setState({ usageInSidebar: false });
    await render();

    const rows = [...container.querySelectorAll('[aria-disabled="true"]')];
    expect(rows).toHaveLength(2);
    expect(rows[0].className).toContain("pointer-events-none");
  });

  it("names the day's spend once there is some", async () => {
    await render(2_400_000);
    expect(container.textContent).toContain("2.4M spent today");
  });
});
