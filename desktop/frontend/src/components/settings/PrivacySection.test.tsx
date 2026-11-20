// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { SettingsMachine } from "../../settingsMachine";
import { settingsFromFile, type Settings } from "../../store/settings";
import type { MachineCommands } from "./machineCommands";
import { SettingsTargetContext } from "./settingsTarget";

vi.mock("../../../bridge/commands", () => ({}));

import { PrivacySection } from "./PrivacySection";

const LOCAL: SettingsMachine = { kind: "local" };
const PEER: SettingsMachine = { kind: "peer", slug: "aabbccdd", name: "Studio", attended: false, mac: false, version: "1.2.3" };

const SWITCHES = [
  {
    label: "Send crash reports",
    setting: "crashReports",
    check: "crashReportsAvailable",
    unavailable: "This build of lpm doesn't send crash reports",
    holds: [
      "your lpm version, operating system version and processor type",
      "terminal output, prompts and project settings are never part of a report",
    ],
  },
  {
    label: "Send daily usage ping",
    setting: "dailyPing",
    check: "dailyPingAvailable",
    unavailable: "This build of lpm doesn't send a daily ping",
    holds: ["your lpm version, operating system and processor type", "A ping has no ID, account or name on it"],
  },
] as const;

let container: HTMLElement;
let root: Root;
let update: Mock<(patch: Partial<Settings>) => Promise<void>>;
let checks: Record<(typeof SWITCHES)[number]["check"], Mock<() => Promise<boolean>>>;

async function render(machine: SettingsMachine, stored: Record<string, unknown> = {}) {
  await act(async () => {
    root.render(
      <SettingsTargetContext.Provider
        value={{ machine, settings: settingsFromFile(stored), update, commands: checks as unknown as MachineCommands }}
      >
        <PrivacySection />
      </SettingsTargetContext.Provider>,
    );
  });
}

const toggle = (label: string) => container.querySelector<HTMLButtonElement>(`[role="switch"][aria-label="${label}"]`)!;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  update = vi.fn(() => Promise.resolve());
  checks = {
    crashReportsAvailable: vi.fn(() => Promise.resolve(true)),
    dailyPingAvailable: vi.fn(() => Promise.resolve(true)),
  };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

it("holds both switches, for this computer and a connected one", async () => {
  for (const machine of [LOCAL, PEER]) {
    await render(machine);
    expect(container.textContent).toContain("Privacy");
    expect([...container.querySelectorAll('[role="switch"]')].map((s) => s.getAttribute("aria-label"))).toEqual(
      SWITCHES.map((s) => s.label),
    );
  }
});

describe.each(SWITCHES)("$label", ({ label, setting, check, unavailable, holds }) => {
  it("starts on, and turning it off saves the switch", async () => {
    await render(LOCAL);
    expect(toggle(label).getAttribute("aria-checked")).toBe("true");

    await act(async () => toggle(label).click());
    expect(update).toHaveBeenCalledWith({ [setting]: false });
  });

  it("turning it back on unsets the switch", async () => {
    await render(LOCAL, { [setting]: false });
    expect(toggle(label).getAttribute("aria-checked")).toBe("false");

    await act(async () => toggle(label).click());
    expect(update).toHaveBeenCalledWith({ [setting]: undefined });
  });

  it("says so in a build that doesn't send it, and can't be turned on", async () => {
    checks[check].mockResolvedValue(false);
    await render(LOCAL);

    expect(toggle(label).disabled).toBe(true);
    expect(toggle(label).getAttribute("aria-checked")).toBe("false");
    expect(container.textContent).toContain(unavailable);
    expect(container.querySelectorAll('[role="switch"]:disabled')).toHaveLength(1);
  });

  it("asks a connected machine about its own build, and one too old to answer has none", async () => {
    checks[check].mockRejectedValue(new Error("unknown command"));
    await render(PEER, { [setting]: true });

    expect(checks[check]).toHaveBeenCalledTimes(1);
    expect(toggle(label).disabled).toBe(true);
  });

  it("shows a connected machine's own switch", async () => {
    await render(PEER, { [setting]: false });
    expect(toggle(label).getAttribute("aria-checked")).toBe("false");
  });

  it("lists what it sends", async () => {
    await render(LOCAL);
    for (const text of holds) expect(container.textContent).toContain(text);
  });
});
