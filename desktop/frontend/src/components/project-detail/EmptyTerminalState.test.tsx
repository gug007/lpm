// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSessionPage } from "../../agentSessions";
import { useSettingsStore } from "../../store/settings";
import type { RemoteAgentLaunch } from "../../remoteAgentTabs";
import type { ActionInfo } from "../../types";
import type { PersistedHistoryEntry } from "../../terminals";

const page: AgentSessionPage = {
  sessions: [
    { provider: "claude", sessionId: "11111111-1111-4111-8111-111111111111", title: "Fix invoice rounding", updatedAt: 3_000 },
    { provider: "codex", sessionId: "22222222-2222-4222-8222-222222222222", title: "Add search filters", updatedAt: 2_000 },
    { provider: "claude", sessionId: "33333333-3333-4333-8333-333333333333", title: "Tidy the README", updatedAt: 1_000 },
    { provider: "codex", sessionId: "44444444-4444-4444-8444-444444444444", title: "Oldest one", updatedAt: 500 },
  ],
  hasMore: false,
};

vi.mock("../../../bridge/runtime", () => ({
  EventsOn: vi.fn(() => () => {}),
  OnFileDrop: vi.fn(),
  OnFileDropOff: vi.fn(),
}));

vi.mock("../../../bridge/commands", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ListAgentSessions: vi.fn(async () => page),
}));

import { EmptyTerminalState } from "./EmptyTerminalState";

interface Handlers {
  actions?: ActionInfo[];
  onNewTerminal?: () => void;
  onOpenAgent?: (launch: RemoteAgentLaunch) => void;
  onRunAction?: (action: ActionInfo, opts?: { prompt?: string | string[] }) => void;
}

function render(history: PersistedHistoryEntry[] = [], handlers: Handlers = {}) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() =>
    root.render(
      <EmptyTerminalState
        projectName="wt-one"
        projectLabel="wt-one"
        projectRoot="/tmp/wt-one"
        fontSize={13}
        actions={handlers.actions ?? []}
        sessionHistory={history}
        hiddenSessions={new Set()}
        onNewTerminal={handlers.onNewTerminal ?? (() => {})}
        onRunCommand={() => {}}
        onOpenAgent={handlers.onOpenAgent ?? (() => {})}
        onRunAction={handlers.onRunAction ?? (() => {})}
        onResumeRow={() => {}}
        onResumeSession={() => {}}
        onOpenLayout={() => {}}
        newTabAsked={false}
        onNewTabHandled={() => {}}
      />,
    ),
  );
  return { container, root };
}

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(name));
  if (!found) throw new Error(`no ${name} button`);
  return found;
}

function plus(container: HTMLElement): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>('button[aria-label="New terminal"]');
  if (!found) throw new Error("no + button");
  return found;
}

function tab(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((t) =>
    t.textContent?.endsWith(name),
  );
  if (!found) throw new Error(`no ${name} tab`);
  return found;
}

describe("EmptyTerminalState", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useSettingsStore.setState({ pickAgentOnNewTab: false });
  });

  it("says what the box does instead of asking a question", () => {
    const { container, root } = render();
    expect(container.textContent).not.toContain("What's next");
    expect(container.textContent).toContain("Open a terminal or start an agent");
    act(() => root.unmount());
  });

  it("lists the three newest conversations to pick up", async () => {
    const { container, root } = render();
    await act(async () => {});
    const text = container.textContent ?? "";
    expect(text).toContain("Pick up where you left off");
    expect(text).toContain("Fix invoice rounding");
    expect(text).toContain("Add search filters");
    expect(text).toContain("Tidy the README");
    expect(text).not.toContain("Oldest one");
    expect(text).toContain("All sessions");
    expect(text).not.toContain("Edit config");
    act(() => root.unmount());
  });

  it("starts on Terminal, then on the agent last started", () => {
    const onOpenAgent = vi.fn();
    const { container, root } = render([], { onOpenAgent });
    const tabs = container.querySelector('[role="radiogroup"][aria-label="Start in"]');
    expect([...(tabs?.querySelectorAll('[role="radio"]') ?? [])].map((t) => t.textContent)).toEqual([
      "Terminal",
      "Claude",
      "Codex",
      "Gemini",
      "OpenCode",
    ]);
    expect(button(container, "Open Terminal")).toBeTruthy();
    act(() => tab(container, "Codex").click());
    act(() => button(container, "Start Codex").click());
    expect(onOpenAgent).toHaveBeenCalledWith(expect.objectContaining({ agent: "codex", prompt: undefined }));
    act(() => root.unmount());

    const again = render();
    expect(button(again.container, "Start Codex")).toBeTruthy();
    act(() => again.root.unmount());
  });

  it("opens a terminal when Terminal is picked", () => {
    const onNewTerminal = vi.fn();
    const { container, root } = render([], { onNewTerminal });
    act(() => tab(container, "Codex").click());
    act(() => tab(container, "Terminal").click());
    act(() => button(container, "Open Terminal").click());
    expect(onNewTerminal).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("opens a terminal from the empty tab strip's +", () => {
    const onNewTerminal = vi.fn();
    const { container, root } = render([], { onNewTerminal });
    act(() => plus(container).click());
    expect(onNewTerminal).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("answers a pick on + with the launcher on the page, not a popup", () => {
    useSettingsStore.setState({ pickAgentOnNewTab: true });
    const onNewTerminal = vi.fn();
    const { container, root } = render([], { onNewTerminal });
    document.body.appendChild(container);
    (document.activeElement as HTMLElement | null)?.blur();
    act(() => plus(container).click());
    expect(onNewTerminal).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"][aria-label="New tab"]')).toBeNull();
    expect(document.activeElement).toBe(container.querySelector('[role="textbox"]'));
    act(() => root.unmount());
    container.remove();
  });

  it("keeps the composer's tools in the box", () => {
    const { container, root } = render();
    expect(container.querySelector('[aria-label="Message history"]')).not.toBeNull();
    act(() => root.unmount());
  });

  it("offers the project's agent actions in place of the bare CLIs", () => {
    const onRunAction = vi.fn();
    const action = (name: string, label: string, cmd: string) =>
      ({ name, label, cmd, confirm: false, display: "header", type: "terminal" }) as ActionInfo;
    const actions = [
      { ...action("claude-max", "claude-max", ""), children: [action("claude-max:ultracode", "Ultracode", "claude --model opus")] },
      action("codex", "Codex", "codex -c 'model_reasoning_effort=\"ultra\"'"),
      action("dev", "Dev", "npm run dev"),
    ];
    const { container, root } = render([], { actions, onRunAction });
    const tabs = container.querySelector('[role="radiogroup"][aria-label="Start in"]');
    expect([...(tabs?.querySelectorAll('[role="radio"]') ?? [])].map((t) => t.textContent)).toEqual([
      "Terminal",
      "Ultracode",
      "Codex",
    ]);
    expect(tab(container, "Ultracode").querySelector("svg")?.dataset.agent).toBe("claude");
    act(() => tab(container, "Codex").click());
    act(() => button(container, "Start Codex").click());
    expect(onRunAction).toHaveBeenCalledWith(actions[1], { prompt: undefined });
    act(() => root.unmount());
  });

  it("picks from a split button's menu and runs the item in the group's color", () => {
    const onRunAction = vi.fn();
    const child = (name: string, label: string) =>
      ({ name, label, cmd: "claude", confirm: false, display: "header", type: "terminal" }) as ActionInfo;
    const group = {
      ...child("claude-max", "claude-max"),
      cmd: "",
      primary: "last-used",
      color: "claude-deep",
      children: [child("claude-max:claude", "Claude"), child("claude-max:fable", "Fable 5")],
    } as ActionInfo;
    const { container, root } = render([], { actions: [group], onRunAction });
    expect(tab(container, "Claude")).toBeTruthy();
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Pick from claude-max"]')?.click());
    const item = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')].find(
      (b) => b.textContent?.includes("Fable 5"),
    );
    act(() => item?.click());
    act(() => button(container, "Start Fable 5").click());
    expect(onRunAction).toHaveBeenCalledWith(
      expect.objectContaining({ name: "claude-max:fable", color: "claude-deep" }),
      { prompt: undefined },
    );
    act(() => root.unmount());
  });
});
