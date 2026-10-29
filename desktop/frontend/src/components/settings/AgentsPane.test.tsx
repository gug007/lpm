// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { SettingsMachine } from "../../settingsMachine";
import type { View } from "../../store/app";
import { settingsFromFile, type Settings } from "../../store/settings";
import type { MachineCommands } from "./machineCommands";
import { SettingsTargetContext } from "./settingsTarget";

const mocks = vi.hoisted(() => ({ setSettingsTab: vi.fn() }));

vi.mock("../../../bridge/runtime", () => ({ EventsOn: vi.fn(() => () => {}), BrowserOpenURL: vi.fn() }));
vi.mock("../../store/app", () => {
  const state = { setSettingsTab: mocks.setSettingsTab };
  return { useAppStore: (select: (s: typeof state) => unknown) => select(state) };
});

import { AgentsPane } from "./AgentsPane";

const STUDIO: SettingsMachine = {
  kind: "peer",
  slug: "aabbccdd",
  name: "Studio",
  attended: false,
  mac: true,
  version: "0.8.0",
};

const commands = {
  statusLine: {
    claudeState: () => Promise.resolve({ selected: "current" }),
    previewClaude: () => Promise.resolve(""),
    codexState: () => Promise.resolve({ items: [], configured: false }),
  },
  checkClaudeHooks: () => Promise.resolve({}),
} as unknown as MachineCommands;

let container: HTMLElement;
let root: Root;
let update: Mock<(patch: Partial<Settings>) => Promise<void>>;
let onNavigate: Mock<(view: View) => void>;

async function render(machine: SettingsMachine, stored: Record<string, unknown> = {}) {
  await act(async () => {
    root.render(
      <SettingsTargetContext.Provider value={{ machine, settings: settingsFromFile(stored), update, commands }}>
        <AgentsPane onNavigate={onNavigate} />
      </SettingsTargetContext.Provider>,
    );
  });
}

const row = (id: string) => container.querySelector<HTMLElement>(`[data-settings-row="${id}"]`);
const description = (id: string) => row(id)?.querySelectorAll("p")[1]?.textContent;
const sections = () => [...container.querySelectorAll("h2")].map((h) => h.textContent);
const button = (id: string, text: string) =>
  [...(row(id)?.querySelectorAll("button") ?? [])].find((b) => b.textContent === text);

beforeEach(() => {
  update = vi.fn((_patch: Partial<Settings>) => Promise.resolve());
  onNavigate = vi.fn((_view: View) => {});
  mocks.setSettingsTab.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AgentsPane", () => {
  it("shows a machine nobody sits at its sidebar and agent CLI rows, and nothing of this one's", async () => {
    await render(STUDIO);
    expect(sections()).toEqual(["lpm's AI", "In the sidebar", "Claude Code", "Codex"]);
    expect(row("agents.quickActions")).toBeNull();
    expect(row("general.agentTools")).toBeNull();
  });

  it("shows the archive rows under Keep finished agents only while it's on", async () => {
    await render(STUDIO, { keepFinishedAgents: false });
    expect(row("general.autoArchiveAgents")).toBeNull();
    expect(row("general.seenAgentsShown")).toBeNull();

    await render(STUDIO, { keepFinishedAgents: true });
    expect(row("general.autoArchiveAgents")?.querySelector("select")?.disabled).toBe(false);
    expect(description("general.seenAgentsShown")).toBe("Any more fold into a “more seen” line");
  });

  it("keeps the hooks' description when their status shows", async () => {
    await render(STUDIO);
    expect(description("ai.claudeHooks")).toContain("Shows what each Claude agent is doing");
  });

  it("picks the model lpm writes with here, not in Git", async () => {
    await render(STUDIO);
    expect(row("git.aiModel")?.querySelector('select[aria-label="Agent"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Git ›");
  });

  it("opens each status line's page, and links to Read Claude usage", async () => {
    await render(STUDIO);
    await act(async () => button("ai.statusLine", "Customize…")?.click());
    await act(async () => button("ai.codexStatusLine", "Customize…")?.click());
    expect(onNavigate.mock.calls).toEqual([["claude-statusline"], ["codex-statusline"]]);

    await act(async () => button("ai.statusLine", "Read Claude usage")?.click());
    expect(mocks.setSettingsTab).toHaveBeenCalledWith("accounts");
  });

  it("writes the message input's settings on the machine shown", async () => {
    await render({ ...STUDIO, attended: true });
    expect(sections().slice(0, 4)).toEqual(["Starting agents", "lpm's AI", "Message input", "In the sidebar"]);
    await act(async () => row("terminal.input")?.querySelector<HTMLButtonElement>("[role=switch]")?.click());
    expect(update).toHaveBeenCalledWith({ composerOpen: false });
  });
});
