// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { SettingsMachine } from "../../settingsMachine";
import { settingsFromFile, type Settings } from "../../store/settings";
import type { MachineCommands } from "./machineCommands";
import { SettingsTargetContext } from "./settingsTarget";

const bridge = vi.hoisted(() => ({
  SetQuickTerminal: vi.fn(),
  QuickTerminalStatus: vi.fn(),
}));
vi.mock("../../../bridge/commands", () => bridge);

import { QuickTerminalSection } from "./QuickTerminalSection";

const LOCAL: SettingsMachine = { kind: "local" };
const PEER: SettingsMachine = { kind: "peer", slug: "aabbccdd", name: "Studio", attended: false, mac: true, version: "0.8.0" };

let container: HTMLElement;
let root: Root;
let update: Mock<(patch: Partial<Settings>) => Promise<void>>;

async function render(machine: SettingsMachine, stored: Record<string, unknown> = {}) {
  await act(async () => {
    root.render(
      <SettingsTargetContext.Provider
        value={{ machine, settings: settingsFromFile(stored), update, commands: {} as MachineCommands }}
      >
        <QuickTerminalSection />
      </SettingsTargetContext.Provider>,
    );
  });
}

const toggle = () => container.querySelector<HTMLButtonElement>('[role="switch"]');

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  update = vi.fn(() => Promise.resolve());
  bridge.QuickTerminalStatus.mockResolvedValue({ registered: false, problem: null });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("QuickTerminalSection", () => {
  it("is only offered for this computer", async () => {
    await render(PEER);
    expect(container.textContent).toBe("");
  });

  it("starts off", async () => {
    await render(LOCAL);
    expect(toggle()?.getAttribute("aria-checked")).toBe("false");
  });

  it("saves the key as on once this computer has registered it", async () => {
    bridge.SetQuickTerminal.mockResolvedValue({ registered: true, problem: null });
    await render(LOCAL);
    await act(async () => toggle()?.click());
    expect(bridge.SetQuickTerminal).toHaveBeenCalledWith(true, expect.any(String));
    expect(update).toHaveBeenCalledWith({ quickTerminal: { enabled: true, key: expect.any(String) } });
  });

  it("stays off and says so when another app holds the key", async () => {
    bridge.SetQuickTerminal.mockResolvedValue({ registered: false, problem: { kind: "held" } });
    await render(LOCAL);
    await act(async () => toggle()?.click());
    expect(update).toHaveBeenCalledWith({ quickTerminal: { enabled: false, key: expect.any(String) } });
    expect(toggle()?.getAttribute("aria-checked")).toBe("false");
    expect(container.textContent).toMatch(/is held by another app\. Press a different key\./);
  });

  it("shows a problem from launch", async () => {
    bridge.QuickTerminalStatus.mockResolvedValue({ registered: false, problem: { kind: "wayland" } });
    await render(LOCAL, { quickTerminal: { enabled: true, key: "ctrl+alt+super+KeyT" } });
    expect(container.textContent).toMatch(/Wayland/);
    expect(toggle()?.getAttribute("aria-checked")).toBe("false");
  });
});
