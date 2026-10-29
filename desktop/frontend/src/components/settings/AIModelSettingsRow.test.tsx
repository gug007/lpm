// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { SettingsMachine } from "../../settingsMachine";
import { settingsFromFile, type Settings } from "../../store/settings";
import type { MachineCommands } from "./machineCommands";
import { SettingsTargetContext } from "./settingsTarget";

const mocks = vi.hoisted(() => ({
  peerInvoke: vi.fn(),
  checkLocal: vi.fn(),
}));

vi.mock("../../../bridge/commands", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../bridge/commands")>()),
  PeerInvoke: mocks.peerInvoke,
  CheckAICLIs: mocks.checkLocal,
}));

import { AIModelSettingsRow } from "./AIModelSettingsRow";

const STUDIO: SettingsMachine = {
  kind: "peer",
  slug: "aabbccdd",
  name: "Studio",
  attended: false,
  mac: false,
  version: "0.7.30",
};

let container: HTMLElement;
let root: Root;
let update: Mock<(patch: Partial<Settings>) => Promise<void>>;

async function render(stored: Record<string, unknown> = {}) {
  await act(async () => {
    root.render(
      <SettingsTargetContext.Provider
        value={{ machine: STUDIO, settings: settingsFromFile(stored), update, commands: {} as MachineCommands }}
      >
        <AIModelSettingsRow />
      </SettingsTargetContext.Provider>,
    );
  });
}

const select = (label: string) => document.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;

async function choose(label: string, value: string) {
  const el = select(label);
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

beforeEach(() => {
  update = vi.fn((_patch: Partial<Settings>) => Promise.resolve());
  mocks.peerInvoke.mockReset().mockResolvedValue({ claude: true, codex: true, gemini: false, opencode: false });
  mocks.checkLocal.mockReset().mockResolvedValue({ claude: true, codex: false, gemini: false, opencode: false });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AIModelSettingsRow", () => {
  it("starts from the defaults while nothing is stored", async () => {
    await render();
    expect(select("Agent").value).toBe("claude");
    expect(select("Model").value).toBe("");
    expect(select("Effort").value).toBe("");
  });

  it("offers the CLIs installed on the machine it configures", async () => {
    await render({ aiCli: "claude", aiModel: "opus", aiEffort: "max" });
    expect(mocks.peerInvoke).toHaveBeenCalledWith("aabbccdd", "check_aicl_is", {});
    expect(mocks.checkLocal).not.toHaveBeenCalled();
    const gemini = [...select("Agent").options].find((o) => o.value === "gemini")!;
    expect(gemini.disabled).toBe(true);
    await choose("Agent", "codex");
    expect(update).toHaveBeenLastCalledWith({ aiCli: "codex", aiModel: undefined, aiEffort: undefined });
  });

  it("keeps the saved effort when a model can take it", async () => {
    await render({ aiCli: "claude", aiModel: "opus", aiEffort: "high" });
    expect(select("Effort").value).toBe("high");
    await choose("Model", "sonnet");
    expect(update).toHaveBeenLastCalledWith({ aiCli: "claude", aiModel: "sonnet", aiEffort: "high" });
  });
});
