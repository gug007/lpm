// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { SettingsMachine } from "../../settingsMachine";
import type { View } from "../../store/app";
import { settingsFromFile, type Settings } from "../../store/settings";
import type { MachineCommands } from "./machineCommands";
import { SettingsTargetContext } from "./settingsTarget";

const mocks = vi.hoisted(() => ({
  peerInvoke: vi.fn(),
  checkLocal: vi.fn(),
}));

vi.mock("../../../bridge/runtime", () => ({ EventsOn: vi.fn(() => () => {}), BrowserOpenURL: vi.fn() }));
vi.mock("../../store/app", () => {
  const state = { projects: [] };
  const useAppStore = Object.assign((select: (s: typeof state) => unknown) => select(state), {
    getState: () => state,
  });
  return { useAppStore };
});
vi.mock("../../../bridge/commands", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../bridge/commands")>()),
  PeerInvoke: mocks.peerInvoke,
  CheckAICLIs: mocks.checkLocal,
}));

import { GitPane } from "./GitPane";

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
let onNavigate: Mock<(view: View) => void>;

async function render(stored: Record<string, unknown> = {}) {
  await act(async () => {
    root.render(
      <SettingsTargetContext.Provider
        value={{
          machine: STUDIO,
          settings: settingsFromFile(stored),
          update,
          commands: {} as MachineCommands,
        }}
      >
        <GitPane onNavigate={onNavigate} />
      </SettingsTargetContext.Provider>,
    );
  });
}

const row = (id: string) => document.querySelector(`[data-settings-row="${id}"]`);
const select = (label: string) => document.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
const checkbox = (label: string) =>
  [...document.querySelectorAll("label")].find((l) => l.textContent?.trim() === label)?.querySelector("input") ?? null;

async function choose(label: string, value: string) {
  const el = select(label);
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

beforeEach(() => {
  update = vi.fn((_patch: Partial<Settings>) => Promise.resolve());
  onNavigate = vi.fn((_view: View) => {});
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

describe("GitPane", () => {
  it("shows the defaults the Git menus use while nothing is stored", async () => {
    await render();
    expect(select("When pulling").value).toBe("ff");
    expect(select("When pushing").value).toBe("default");
    expect(checkbox("Every remote")?.checked).toBe(true);
    expect(checkbox("Remove deleted branches")?.checked).toBe(true);
    expect(checkbox("Remove deleted tags")?.checked).toBe(false);
    expect(checkbox("Get tags")?.checked).toBe(false);
    expect(checkbox("When pushing")?.checked).toBe(false);
    expect(checkbox("When pulling")?.checked).toBe(false);
  });

  it("names the model AI writes with, and leaves choosing it to Agents", async () => {
    await render({ aiCli: "claude", aiModel: "opus", aiEffort: "high" });
    expect(select("Agent")).toBeNull();
    expect(document.body.textContent).toContain("Claude Code · Opus · High effort");
    expect(document.body.textContent).toContain("Change in Agents");
  });

  it("shows Auto pull under Check for new commits only while it's on", async () => {
    await render({ checkOrigin: false });
    expect(row("general.autoPull")).toBeNull();
    await render({ checkOrigin: true });
    expect(row("general.autoPull")).not.toBeNull();
  });

  it("writes whole Git objects, the way the menus store them", async () => {
    await render({ gitPull: { strategy: "ff-only", autostash: true }, gitFetch: { prune: false } });
    await choose("When pulling", "rebase");
    expect(update).toHaveBeenLastCalledWith({ gitPull: { strategy: "rebase", autostash: true, noVerify: false } });
    await act(async () => checkbox("Get tags")!.click());
    expect(update).toHaveBeenLastCalledWith({ gitFetch: { all: true, prune: false, pruneTags: false, tags: true } });
    await act(async () => checkbox("When pushing")!.click());
    expect(update).toHaveBeenLastCalledWith({ gitPush: { mode: "default", noVerify: true, tags: false } });
  });

  it("opens each instructions page", async () => {
    await render();
    const edits = [...document.querySelectorAll("button")].filter((b) => b.textContent === "Edit");
    for (const edit of edits) await act(async () => edit.click());
    expect(onNavigate.mock.calls.map(([view]) => view)).toEqual([
      "commit-instructions",
      "pr-instructions",
      "branch-instructions",
    ]);
  });
});
