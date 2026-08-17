// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agentUsageStats: vi.fn(),
  agentLimits: vi.fn(),
}));

vi.mock("../../bridge/commands", () => ({
  AgentUsageStats: mocks.agentUsageStats,
  AgentLimits: mocks.agentLimits,
  LoadClaudeAccounts: vi.fn(async () => ({ accounts: [] })),
  SaveClaudeAccounts: vi.fn(),
  RemoveClaudeAccount: vi.fn(),
  ClaudeAccountsStatus: vi.fn(async () => ({ statuses: [] })),
  ClaudeAccountUsage: vi.fn(async () => ({ usage: {} })),
}));
vi.mock("../../bridge/runtime", () => ({
  EventsOn: vi.fn(() => () => {}),
}));

import { useAccountsStore } from "../store/accounts";
import { useSettingsStore } from "../store/settings";
import { SidebarUsage } from "./SidebarUsage";

let container: HTMLDivElement;
let root: Root;

const IN_TWO_HOURS = Math.floor(Date.now() / 1000) + 2 * 60 * 60;

function limits() {
  return {
    claude: {
      provider: "claude",
      fiveHour: { usedPercent: 34, resetsAt: IN_TWO_HOURS },
      weekly: { usedPercent: 61, resetsAt: IN_TWO_HOURS + 86_400 },
      updatedAt: Date.now(),
    },
    codex: {
      provider: "codex",
      fiveHour: { usedPercent: 12, resetsAt: IN_TWO_HOURS },
      updatedAt: Date.now(),
    },
  };
}

function usage(claude: number) {
  const tokens = (total: number) => ({
    inputTokens: total,
    cachedInputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: total,
  });
  return {
    generatedAt: 0,
    days: 1,
    sessions: 1,
    totals: tokens(claude),
    providers: [{ key: "claude", label: "Claude Code", sessions: 2, tokens: tokens(claude) }],
    projects: [],
    models: [],
    daily: [],
    recentSessions: [],
    sources: [],
  };
}

async function render(onOpen = () => {}) {
  await act(async () => {
    root.render(<SidebarUsage onOpen={onOpen} />);
  });
}

beforeEach(() => {
  mocks.agentLimits.mockResolvedValue(limits());
  mocks.agentUsageStats.mockResolvedValue(usage(0));
  useSettingsStore.setState({
    usageInSidebar: true,
    usageSidebarTools: undefined,
    usageSidebarWindow: undefined,
  });
  useAccountsStore.setState({ accounts: [], statuses: {}, usage: {} });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("SidebarUsage", () => {
  it("shows when each tool's window comes back", async () => {
    await render();

    const rows = [...container.querySelectorAll("button")];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Claude");
    expect(rows[0].textContent).toContain("1d 2h");
    expect(rows[0].textContent).toContain("61%");
    expect(rows[1].textContent).toContain("Codex");
    expect(rows[1].textContent).toContain("2h");
    expect(rows[1].textContent).toContain("12%");
  });

  it("switches to the 5-hour window when that is the setting", async () => {
    useSettingsStore.setState({ usageSidebarWindow: "fiveHour" });
    await render();

    const [claude] = [...container.querySelectorAll("button")];
    expect(claude.textContent).toContain("2h");
  });

  it("gives each Claude account its own row", async () => {
    mocks.agentLimits.mockResolvedValue({
      "claude:acc-work": {
        provider: "claude",
        accountId: "acc-work",
        weekly: { usedPercent: 91, resetsAt: IN_TWO_HOURS + 86_400 },
        updatedAt: Date.now(),
      },
      "claude:acc-home": {
        provider: "claude",
        accountId: "acc-home",
        weekly: { usedPercent: 12, resetsAt: IN_TWO_HOURS + 86_400 },
        updatedAt: Date.now() - 120_000,
      },
    });
    useAccountsStore.setState({
      accounts: [
        { id: "acc-work", label: "Work" },
        { id: "acc-home", label: "Home" },
      ],
    });
    await render();

    const rows = [...container.querySelectorAll("button")];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Work");
    expect(rows[0].textContent).toContain("91%");
    expect(rows[1].textContent).toContain("Home");
    expect(rows[1].textContent).toContain("12%");
  });

  it("hides a tool the user turned off", async () => {
    useSettingsStore.setState({ usageSidebarTools: ["codex"] });
    await render();

    const rows = [...container.querySelectorAll("button")];
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Codex");
  });

  it("falls back to today's spend for a tool with no window yet", async () => {
    mocks.agentLimits.mockResolvedValue({});
    mocks.agentUsageStats.mockResolvedValue(usage(2_000_000));
    await render();

    const rows = [...container.querySelectorAll("button")];
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("2.0M today");
  });

  it("opens the full usage card beside the row on hover", async () => {
    await render();
    const [claude] = [...container.querySelectorAll("button")];

    await act(async () => {
      claude.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      vi.advanceTimersByTime(300);
    });

    const card = document.body.querySelector('[role="tooltip"]');
    expect(card).not.toBeNull();
    const text = card!.textContent ?? "";
    expect(text).toContain("5-hour");
    expect(text).toContain("Weekly");
    expect(text).toContain("61");
    expect(text).toContain("resets in 1d 2h");

    await act(async () => {
      claude.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
  });

  it("carries the day's spend under the card", async () => {
    mocks.agentUsageStats.mockResolvedValue(usage(2_400_000));
    await render();

    await act(async () => {
      container.querySelector("button")!.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true }),
      );
      vi.advanceTimersByTime(300);
    });

    expect(document.body.querySelector('[role="tooltip"]')!.textContent).toContain(
      "2.4M spent today · 2 sessions",
    );
  });

  it("opens the usage window when a row is clicked", async () => {
    const onOpen = vi.fn();
    await render(onOpen);

    act(() => container.querySelector("button")!.click());
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("stays out of the sidebar when the setting is off", async () => {
    useSettingsStore.setState({ usageInSidebar: false });
    await render();

    expect(container.textContent).toBe("");
    expect(mocks.agentUsageStats).not.toHaveBeenCalled();
  });

  it("renders nothing when no tool has reported anything", async () => {
    mocks.agentLimits.mockResolvedValue({});
    await render();

    expect(container.textContent).toBe("");
  });
});
