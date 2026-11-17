// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agentUsageMachines: vi.fn(),
  agentLimits: vi.fn(),
  claudeLimitsAccount: vi.fn(),
  peerInvoke: vi.fn(),
  app: { selected: null as string | null, projects: [] as unknown[] },
}));

vi.mock("../store/app", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(mocks.app),
}));
vi.mock("../../bridge/commands", () => ({
  AgentUsageMachines: mocks.agentUsageMachines,
  AgentLimits: mocks.agentLimits,
  ClaudeLimitsAccount: mocks.claudeLimitsAccount,
  PeerInvoke: mocks.peerInvoke,
  AcceptClaudePoolPick: vi.fn(),
  ClaudePoolState: vi.fn(),
  ResumeClaudePool: vi.fn(),
  SetClaudePool: vi.fn(),
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
import { useClaudePoolStore, type ClaudePool } from "../store/claudePool";
import { useMachineClaudeStore } from "../store/machineClaude";
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

function today(claude: number) {
  return { machine: "local", stats: usage(claude), machines: [] };
}

// Claude readings of the weekly window, by account.
function weekly(used: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(used).map(([id, usedPercent]) => [
      `claude:${id}`,
      {
        provider: "claude",
        accountId: id,
        weekly: { usedPercent, resetsAt: IN_TWO_HOURS + 86_400 },
        updatedAt: Date.now(),
      },
    ]),
  );
}

async function render(onOpen = () => {}) {
  await act(async () => {
    root.render(<SidebarUsage onOpen={onOpen} />);
  });
}

beforeEach(() => {
  mocks.agentLimits.mockResolvedValue(limits());
  mocks.agentUsageMachines.mockResolvedValue(today(0));
  useSettingsStore.setState({
    usageInSidebar: true,
    usageSidebarTools: undefined,
    usageSidebarWindow: undefined,
  });
  useAccountsStore.setState({ accounts: [], statuses: {}, usage: {} });
  useClaudePoolStore.setState({ pool: null });
  useMachineClaudeStore.setState({ machines: {}, aliases: {} });
  mocks.app.selected = null;
  mocks.app.projects = [];
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

  it("lists the card's windows in the row's order", async () => {
    const labels = async () => {
      const [claude] = [...container.querySelectorAll("button")];
      await act(async () => {
        claude.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        vi.advanceTimersByTime(300);
      });
      const text = document.body.querySelector('[role="tooltip"]')!.textContent ?? "";
      await act(async () => {
        claude.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      });
      return [text.indexOf("Weekly"), text.indexOf("5-hour")];
    };

    await render();
    const [weekly, fiveHour] = await labels();
    expect(weekly).toBeLessThan(fiveHour);

    useSettingsStore.setState({ usageSidebarWindow: "fiveHour" });
    await render();
    const [weeklyAfter, fiveHourAfter] = await labels();
    expect(fiveHourAfter).toBeLessThan(weeklyAfter);
  });

  it("draws the use past the pace tick in red", async () => {
    const nowS = Math.floor(Date.now() / 1000);
    mocks.agentLimits.mockResolvedValue({
      claude: {
        provider: "claude",
        weekly: { usedPercent: 98, resetsAt: nowS + 15 * 60 * 60 },
        updatedAt: Date.now(),
      },
      codex: {
        provider: "codex",
        weekly: { usedPercent: 20, resetsAt: nowS + 102 * 60 * 60 },
        updatedAt: Date.now(),
      },
    });
    await render();

    const [ahead, behind] = [...container.querySelectorAll<HTMLElement>('[data-lane="upper"]')];
    expect(ahead.style.background).toContain("var(--accent-red)");
    expect(behind.style.background).not.toContain("var(--accent-red)");
  });

  it("labels only a 5-hour reading and reads out the other window", async () => {
    await render();

    const [claude, codex] = [...container.querySelectorAll("button")];
    expect(claude.textContent).not.toContain("7d");
    expect(codex.textContent).toContain("5h");
    expect(claude.querySelector(".sr-only")?.textContent).toBe("5-hour 34% used");
  });

  it("leaves the 5-hour window out for a plan that has none", async () => {
    mocks.agentLimits.mockResolvedValue({
      "claude:default": {
        provider: "claude",
        accountId: "default",
        weekly: { usedPercent: 60, resetsAt: IN_TWO_HOURS + 86_400 },
        updatedAt: Date.now(),
        noFiveHour: true,
      },
      "claude:work": {
        provider: "claude",
        accountId: "work",
        fiveHour: { usedPercent: 40, resetsAt: IN_TWO_HOURS },
        weekly: { usedPercent: 14, resetsAt: IN_TWO_HOURS + 86_400 },
        updatedAt: Date.now(),
      },
    });
    useAccountsStore.setState({ accounts: [{ id: "work", label: "Claude 2" }] });
    useSettingsStore.setState({ usageSidebarWindow: "fiveHour" });
    await render();

    const cardOf = async (row: HTMLElement) => {
      await act(async () => {
        row.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        vi.advanceTimersByTime(300);
      });
      const text = document.body.querySelector('[role="tooltip"]')!.textContent ?? "";
      await act(async () => {
        row.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      });
      return text;
    };
    const [work, main] = [...container.querySelectorAll<HTMLElement>("button")];
    expect(main.textContent).toContain("60%");
    expect(main.textContent).not.toContain("5h");
    expect(main.querySelector(".sr-only")).toBeNull();
    expect(main.querySelector('[data-lane="upper"]')).not.toBeNull();
    expect(main.querySelector('[data-lane="lower"]')).toBeNull();
    expect(work.querySelector('[data-lane="lower"]')).not.toBeNull();

    const mainCard = await cardOf(main);
    expect(mainCard).toContain("Weekly");
    expect(mainCard).not.toContain("5-hour");
    expect(await cardOf(work)).toContain("5-hour");
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

  describe("the selected project's account", () => {
    function twoAccounts() {
      mocks.agentLimits.mockResolvedValue(weekly({ "acc-work": 40, "acc-home": 12 }));
      useAccountsStore.setState({
        accounts: [
          { id: "acc-work", label: "Work" },
          { id: "acc-home", label: "Home" },
        ],
      });
    }

    function tag(account: string) {
      const row = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(account))!;
      return row.querySelector('[aria-hidden="true"].rounded')?.textContent ?? null;
    }

    it("tags the account it runs on", async () => {
      twoAccounts();
      mocks.app.selected = "api";
      mocks.app.projects = [{ name: "api", isRemote: false, claudeAccount: "acc-home" }];
      await render();

      expect(mocks.claudeLimitsAccount).not.toHaveBeenCalled();
      expect(tag("Home")).toBe("in use");
      expect(tag("Work")).toBeNull();
      expect(container.textContent).toContain("New Claude sessions in api use this account");
    });

    it("tags the rest of its pool while switching is on", async () => {
      twoAccounts();
      mocks.app.selected = "api";
      mocks.app.projects = [{ name: "api", isRemote: false, claudeAccounts: ["acc-work", "acc-home"] }];
      useClaudePoolStore.setState({
        pool: {
          active: true,
          pools: [{ key: "project:api", project: "api", members: ["acc-work", "acc-home"], current: "acc-work", pick: null }],
        } as unknown as ClaudePool,
      });
      mocks.claudeLimitsAccount.mockResolvedValue("acc-work");
      await render();

      expect(tag("Work")).toBe("in use");
      expect(tag("Home")).toBe("pool");
    });

    it("keeps the tag in place while switching projects", async () => {
      twoAccounts();
      useClaudePoolStore.setState({
        pool: {
          active: false,
          pools: [{ key: "__main__", project: null, members: [], current: null, pick: null }],
        } as unknown as ClaudePool,
      });
      mocks.app.projects = [
        { name: "api", isRemote: false },
        { name: "web", isRemote: false },
        { name: "pinned", isRemote: false, claudeAccount: "acc-work" },
      ];
      mocks.claudeLimitsAccount.mockResolvedValue("acc-home");
      mocks.app.selected = "api";
      await render();
      expect(tag("Home")).toBe("in use");

      for (const [selected, account] of [
        ["web", "Home"],
        ["pinned", "Work"],
        ["api", "Home"],
      ]) {
        mocks.app.selected = selected;
        act(() => root.render(<SidebarUsage onOpen={() => {}} />));
        expect(tag(account)).toBe("in use");
      }
    });

    describe("on a paired machine", () => {
      const SLUG = "abcdef12";
      const API = `peer-${SLUG}-api`;

      function pairedMachine(pool: unknown = null) {
        useMachineClaudeStore.setState({ aliases: { [SLUG]: "Mac mini" } });
        mocks.peerInvoke.mockImplementation(async (slug: string, cmd: string) => {
          if (slug !== SLUG) throw new Error(`no machine ${slug}`);
          if (cmd === "agent_limits") return weekly({ "acc-mini": 70, "acc-spare": 5 });
          if (cmd === "host_claude_accounts") {
            return {
              accounts: [
                { id: "acc-mini", label: "Mini" },
                { id: "acc-spare", label: "Spare" },
              ],
              statuses: [],
              usage: {},
              pool,
            };
          }
          throw new Error(`unexpected ${cmd}`);
        });
      }

      it("shows that machine's accounts and tags the one its project runs on", async () => {
        twoAccounts();
        pairedMachine();
        mocks.app.selected = API;
        mocks.app.projects = [{ name: API, label: "api", isRemote: false, claudeAccount: "acc-spare" }];
        await render();

        expect(container.textContent).not.toContain("Work");
        expect(mocks.agentUsageMachines).toHaveBeenCalledWith(1, SLUG, false);
        expect(tag("Spare")).toBe("in use");
        expect(tag("Mini")).toBeNull();
        expect(container.textContent).toContain("New Claude sessions in api on Mac mini use this account");
      });

      it("asks for the login its project runs on", async () => {
        twoAccounts();
        pairedMachine({
          active: false,
          pools: [{ key: "__main__", project: null, members: [], current: null, pick: null }],
        });
        mocks.claudeLimitsAccount.mockResolvedValue("acc-mini");
        mocks.app.selected = API;
        mocks.app.projects = [{ name: API, label: "api", isRemote: false }];
        await render();

        expect(mocks.claudeLimitsAccount).toHaveBeenCalledWith(API);
        expect(tag("Mini")).toBe("in use");
      });
    });

    it("marks nothing for a remote project", async () => {
      twoAccounts();
      mocks.app.selected = "far";
      mocks.app.projects = [{ name: "far", isRemote: true }];
      await render();

      expect(mocks.claudeLimitsAccount).not.toHaveBeenCalled();
      expect(tag("Work")).toBeNull();
      expect(tag("Home")).toBeNull();
    });

    it("marks nothing with a single Claude row", async () => {
      mocks.app.selected = "api";
      mocks.app.projects = [{ name: "api", isRemote: false }];
      mocks.claudeLimitsAccount.mockResolvedValue("default");
      await render();

      expect(tag("Claude")).toBeNull();
    });
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
    mocks.agentUsageMachines.mockResolvedValue(today(2_000_000));
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
    mocks.agentUsageMachines.mockResolvedValue(today(2_400_000));
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
    expect(mocks.agentUsageMachines).not.toHaveBeenCalled();
  });

  it("renders nothing when no tool has reported anything", async () => {
    mocks.agentLimits.mockResolvedValue({});
    await render();

    expect(container.textContent).toBe("");
  });
});
