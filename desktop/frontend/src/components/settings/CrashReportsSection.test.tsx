// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { SettingsMachine } from "../../settingsMachine";
import { settingsFromFile, type Settings } from "../../store/settings";
import type { MachineCommands } from "./machineCommands";
import { SettingsTargetContext } from "./settingsTarget";

vi.mock("../../../bridge/commands", () => ({}));

import { CrashReportsSection } from "./CrashReportsSection";

const LOCAL: SettingsMachine = { kind: "local" };
const PEER: SettingsMachine = { kind: "peer", slug: "aabbccdd", name: "Studio", attended: false, mac: false, version: "1.2.3" };

let container: HTMLElement;
let root: Root;
let update: Mock<(patch: Partial<Settings>) => Promise<void>>;
let available: Mock<() => Promise<boolean>>;

async function render(machine: SettingsMachine, stored: Record<string, unknown> = {}) {
  await act(async () => {
    root.render(
      <SettingsTargetContext.Provider
        value={{ machine, settings: settingsFromFile(stored), update, commands: { crashReportsAvailable: available } as unknown as MachineCommands }}
      >
        <CrashReportsSection />
      </SettingsTargetContext.Provider>,
    );
  });
}

const toggle = () => container.querySelector<HTMLButtonElement>('[role="switch"]')!;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  update = vi.fn(() => Promise.resolve());
  available = vi.fn(() => Promise.resolve(true));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("CrashReportsSection", () => {
  it("starts off, and turning it on saves the switch", async () => {
    await render(LOCAL);
    expect(toggle().getAttribute("aria-checked")).toBe("false");

    await act(async () => toggle().click());
    expect(update).toHaveBeenCalledWith({ crashReports: true });
  });

  it("turning it off unsets the switch", async () => {
    await render(LOCAL, { crashReports: true });
    expect(toggle().getAttribute("aria-checked")).toBe("true");

    await act(async () => toggle().click());
    expect(update).toHaveBeenCalledWith({ crashReports: undefined });
  });

  it("says so in a build that reports nowhere, and can't be turned on", async () => {
    available.mockResolvedValue(false);
    await render(LOCAL, { crashReports: true });

    expect(toggle().disabled).toBe(true);
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(container.textContent).toContain("This build of lpm doesn't send crash reports");
  });

  it("asks a connected machine about its own build, and one too old to answer has none", async () => {
    available.mockRejectedValue(new Error("unknown command"));
    await render(PEER, { crashReports: true });

    expect(available).toHaveBeenCalledTimes(1);
    expect(toggle().disabled).toBe(true);
  });

  it("shows a connected machine's own switch", async () => {
    await render(PEER, { crashReports: true });
    expect(toggle().getAttribute("aria-checked")).toBe("true");
  });

  it("lists what a report holds", async () => {
    await render(LOCAL);
    expect(container.textContent).toContain("your lpm version, operating system version and processor type");
    expect(container.textContent).toContain("terminal output, prompts and project settings are never part of a report");
  });
});
