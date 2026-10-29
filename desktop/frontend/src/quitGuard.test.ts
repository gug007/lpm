import { beforeEach, describe, expect, it, vi } from "vitest";
import { STATUS_RUNNING, STATUS_WAITING, type ProjectInfo, type StatusEntry } from "./types";

const bridge = vi.hoisted(() => ({
  quit: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  projects: [] as ProjectInfo[],
  toasts: [] as { kind: string; message: unknown; options?: { id?: string } }[],
  dismissed: [] as unknown[],
}));

vi.mock("../bridge/commands", () => ({ QuitApp: bridge.quit }));
vi.mock("./store/app", () => ({
  useAppStore: { getState: () => ({ projects: bridge.projects }) },
}));
vi.mock("./store/globalAgentStatus", () => ({
  useGlobalAgentStatus: { getState: () => ({ entries: [] }) },
}));
vi.mock("./notifications/toast", () => ({
  toast: Object.assign(vi.fn(), {
    loading: (message: unknown, options?: { id?: string }) => {
      bridge.toasts.push({ kind: "loading", message, options });
      return options?.id ?? "t";
    },
    error: vi.fn(),
    dismiss: (id: unknown) => bridge.dismissed.push(id),
  }),
}));

import {
  cancelQuit,
  checkWaitingToQuit,
  quitNow,
  quitWhenAgentsFinish,
  requestQuit,
  stopWaitingToQuit,
  useQuitGuard,
  waitingText,
} from "./quitGuard";

const NOW = Date.now();

const entry = (key: string, value: string): StatusEntry => ({
  key,
  value,
  priority: 0,
  timestamp: NOW,
  paneID: `%${key}`,
});

function project(name: string, statusEntries: StatusEntry[]): ProjectInfo {
  return {
    name,
    session: name,
    root: `/Users/dev/${name}`,
    running: false,
    services: [],
    allServices: [],
    actions: [],
    profiles: [],
    activeProfile: "",
    statusEntries,
    isRemote: false,
  };
}

beforeEach(() => {
  bridge.quit.mockClear();
  bridge.projects = [];
  bridge.toasts = [];
  bridge.dismissed = [];
  useQuitGuard.setState({ asking: null, waiting: false });
});

describe("quit guard", () => {
  it("quits at once when no agent is mid-task", () => {
    bridge.projects = [project("api", [])];
    requestQuit();
    expect(bridge.quit).toHaveBeenCalledTimes(1);
    expect(useQuitGuard.getState().asking).toBeNull();
  });

  it("asks first when an agent is working or waiting on a question", () => {
    bridge.projects = [
      project("api", [entry("claude_code_a", STATUS_RUNNING)]),
      project("web", [entry("codex_b", STATUS_WAITING)]),
    ];
    requestQuit();
    expect(bridge.quit).not.toHaveBeenCalled();
    expect(useQuitGuard.getState().asking).toEqual([
      { key: "api", name: "api", count: 1, asking: 0 },
      { key: "web", name: "web", count: 1, asking: 1 },
    ]);
  });

  it("cancel keeps lpm open", () => {
    bridge.projects = [project("api", [entry("claude_code_a", STATUS_RUNNING)])];
    requestQuit();
    cancelQuit();
    expect(useQuitGuard.getState().asking).toBeNull();
    expect(bridge.quit).not.toHaveBeenCalled();
  });

  it("quit now ends the agents", () => {
    bridge.projects = [project("api", [entry("claude_code_a", STATUS_RUNNING)])];
    requestQuit();
    quitNow();
    expect(bridge.quit).toHaveBeenCalledTimes(1);
    expect(useQuitGuard.getState()).toEqual({ asking: null, waiting: false });
  });

  it("waits for the last agent to finish, then quits", () => {
    bridge.projects = [project("api", [entry("claude_code_a", STATUS_RUNNING), entry("codex_b", STATUS_RUNNING)])];
    requestQuit();
    quitWhenAgentsFinish();
    expect(useQuitGuard.getState()).toEqual({ asking: null, waiting: true });
    expect(bridge.toasts.at(-1)?.message).toBe("lpm quits when 2 agents finish");

    bridge.projects = [project("api", [entry("claude_code_a", STATUS_RUNNING)])];
    checkWaitingToQuit();
    expect(bridge.quit).not.toHaveBeenCalled();
    expect(bridge.toasts.at(-1)?.message).toBe("lpm quits when the agent finishes");

    bridge.projects = [project("api", [])];
    checkWaitingToQuit();
    expect(bridge.quit).toHaveBeenCalledTimes(1);
  });

  it("stops waiting when asked not to quit", () => {
    bridge.projects = [project("api", [entry("claude_code_a", STATUS_RUNNING)])];
    quitWhenAgentsFinish();
    stopWaitingToQuit();
    bridge.projects = [];
    checkWaitingToQuit();
    expect(bridge.quit).not.toHaveBeenCalled();
    expect(bridge.dismissed).toContain("quit-when-agents-finish");
  });

  it("words the wait by how many are left", () => {
    expect(waitingText([{ key: "a", name: "a", count: 1, asking: 0 }])).toBe("lpm quits when the agent finishes");
    expect(
      waitingText([
        { key: "a", name: "a", count: 2, asking: 0 },
        { key: "b", name: "b", count: 1, asking: 1 },
      ]),
    ).toBe("lpm quits when 3 agents finish");
  });
});
