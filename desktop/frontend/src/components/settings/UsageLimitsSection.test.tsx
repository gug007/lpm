// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { SettingsMachine } from "../../settingsMachine";
import { settingsFromFile, type Settings } from "../../store/settings";
import type { MachineCommands } from "./machineCommands";
import { SettingsTargetContext } from "./settingsTarget";

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  load: vi.fn(),
  setUsageOpen: vi.fn(),
}));

vi.mock("../../../bridge/runtime", () => ({ EventsOn: vi.fn(() => () => {}) }));
vi.mock("../../../bridge/commands", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../bridge/commands")>()),
  ApplyClaudeLimits: mocks.apply,
}));
vi.mock("../../store/app", () => {
  const state = { setUsageOpen: mocks.setUsageOpen };
  return { useAppStore: (select: (s: typeof state) => unknown) => select(state) };
});
vi.mock("../../store/machineClaude", () => {
  const state = { load: mocks.load };
  return { useMachineClaudeStore: (select: (s: typeof state) => unknown) => select(state) };
});

import { UsageLimitsSection } from "./UsageLimitsSection";

const peer = (attended: boolean): SettingsMachine => ({
  kind: "peer",
  slug: "aabbccdd",
  name: "Studio",
  attended,
  mac: true,
  version: "0.8.0",
});

let container: HTMLElement;
let root: Root;
let update: Mock<(patch: Partial<Settings>) => Promise<void>>;

async function render(machine: SettingsMachine, stored: Record<string, unknown> = {}) {
  await act(async () => {
    root.render(
      <SettingsTargetContext.Provider
        value={{ machine, settings: settingsFromFile(stored), update, commands: {} as MachineCommands }}
      >
        <UsageLimitsSection />
      </SettingsTargetContext.Provider>,
    );
  });
}

const row = (id: string) => container.querySelector<HTMLElement>(`[data-settings-row="${id}"]`);
const description = (id: string) => row(id)?.querySelectorAll("p")[1]?.textContent;

beforeEach(() => {
  update = vi.fn((_patch: Partial<Settings>) => Promise.resolve());
  mocks.apply.mockReset().mockResolvedValue(undefined);
  mocks.load.mockReset().mockResolvedValue({});
  mocks.setUsageOpen.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("UsageLimitsSection", () => {
  it("turns Read Claude usage on where the machine stores and applies it", async () => {
    await render(peer(false));
    await act(async () => row("accounts.readClaudeUsage")?.querySelector<HTMLButtonElement>("[role=switch]")?.click());
    expect(update).toHaveBeenCalledWith({ claudeLimitsEnabled: true });
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.load).toHaveBeenCalledWith("aabbccdd");
  });

  it("keeps the sidebar meter off a machine nobody sits at, and the Usage window to this one", async () => {
    await render(peer(false));
    expect(row("accounts.readClaudeUsage")).not.toBeNull();
    expect(row("accounts.sidebarUsage")).toBeNull();
    expect(row("usage")).toBeNull();
  });

  it("shows the meter's tools and limit under it only while the meter is on", async () => {
    await render(peer(true), { usageInSidebar: false });
    expect(row("accounts.sidebarUsageTools")).toBeNull();
    expect(row("accounts.sidebarUsageWindow")).toBeNull();
    await act(async () => row("accounts.sidebarUsage")?.querySelector<HTMLButtonElement>("[role=switch]")?.click());
    expect(update).toHaveBeenCalledWith({ usageInSidebar: true });

    await render(peer(true), { usageInSidebar: true });
    expect(description("accounts.sidebarUsageTools")).toBe("Which plans the meter follows");
    expect([...row("accounts.sidebarUsageWindow")!.querySelectorAll("button")].some((b) => b.disabled)).toBe(false);
  });

  it("changes the meter's tools on the machine shown", async () => {
    await render(peer(true));
    const claude = [...row("accounts.sidebarUsageTools")!.querySelectorAll("button")].find(
      (b) => b.textContent === "Claude",
    );
    await act(async () => claude?.click());
    expect(update).toHaveBeenCalledWith({ usageSidebarTools: ["codex"] });
  });

  it("opens the Usage window here", async () => {
    await render({ kind: "local" });
    await act(async () => row("usage")?.querySelector("button")?.click());
    expect(mocks.setUsageOpen).toHaveBeenCalledWith(true);
  });
});
