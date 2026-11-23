import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const badge = vi.hoisted(() => vi.fn((_count: number) => Promise.resolve()));

// vi.mock hoists above any const, so the factories are inlined. `then` must
// stay undefined: a function there makes the mocked module thenable and
// vitest awaits it forever.
vi.mock("../bridge/commands", () =>
  new Proxy({}, {
    has: () => true,
    get: (_t, prop) => (prop === "then" ? undefined : prop === "SetAttentionBadge" ? badge : vi.fn()),
  }));
vi.mock("../bridge/runtime", () =>
  new Proxy({}, {
    has: () => true,
    get: (_t, prop) => (prop === "then" ? undefined : vi.fn()),
  }));

import { appIconBadgeWords } from "./appIconBadgeWords";
import { waitingAgentCount, watchAttentionBadge } from "./attentionBadge";
import { useAppStore } from "./store/app";
import { useGlobalAgentStatus } from "./store/globalAgentStatus";
import { useSettingsStore } from "./store/settings";
import { STATUS_DONE, STATUS_RUNNING, STATUS_WAITING, type ProjectInfo, type StatusEntry } from "./types";

const status = (key: string, value: string, paneID?: string): StatusEntry => ({
  key,
  value,
  priority: 0,
  timestamp: 1,
  ...(paneID && { paneID }),
});

const project = (name: string, statusEntries: StatusEntry[]) => ({ name, statusEntries }) as ProjectInfo;

describe("waitingAgentCount", () => {
  it("counts a tab once, however many of its agents wait", () => {
    expect(
      waitingAgentCount([
        [
          status("claude_code_a", STATUS_WAITING, "t1"),
          status("claude_code_b", STATUS_WAITING, "t1"),
          status("codex_c", STATUS_RUNNING, "t1"),
          status("codex_d", STATUS_WAITING, "t2"),
          status("codex_e", STATUS_DONE, "t3"),
        ],
      ]),
    ).toBe(2);
  });

  it("counts a tab whose waiting agent sits behind a busy one", () => {
    expect(
      waitingAgentCount([[status("codex_busy", STATUS_RUNNING, "t1"), status("claude_code_ask", STATUS_WAITING, "t1")]]),
    ).toBe(1);
  });

  it("counts statuses that name no tab each on their own", () => {
    expect(waitingAgentCount([[status("custom_a", STATUS_WAITING), status("custom_b", STATUS_WAITING)]])).toBe(2);
  });

  it("adds up every list and skips empty ones", () => {
    expect(
      waitingAgentCount([
        [status("claude_code_a", STATUS_WAITING, "t1")],
        undefined,
        [],
        [status("claude_code_a", STATUS_WAITING, "t1")],
      ]),
    ).toBe(2);
  });
});

describe("watchAttentionBadge", () => {
  let stop: () => void = () => {};

  beforeEach(() => {
    vi.useFakeTimers();
    badge.mockClear();
    useSettingsStore.setState({ appIconBadge: undefined });
    useGlobalAgentStatus.setState({ entries: [] });
    useAppStore.setState({
      projects: [
        project("web", [status("claude_code_a", STATUS_WAITING, "t1")]),
        project("api", [status("codex_b", STATUS_WAITING, "t2")]),
      ],
    });
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it("shows the count once things settle, and again only when it changes", async () => {
    stop = watchAttentionBadge();
    expect(badge).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(badge.mock.calls).toEqual([[2]]);

    useAppStore.setState({ projects: [...useAppStore.getState().projects] });
    await vi.advanceTimersByTimeAsync(300);
    expect(badge).toHaveBeenCalledTimes(1);

    useAppStore.setState({ projects: [project("web", [status("claude_code_a", STATUS_RUNNING, "t1")])] });
    useGlobalAgentStatus.setState({ entries: [status("claude_code_g", STATUS_WAITING, "g1")] });
    await vi.advanceTimersByTimeAsync(300);
    expect(badge.mock.calls).toEqual([[2], [1]]);
  });

  it("clears the icon when the setting is off", async () => {
    stop = watchAttentionBadge();
    await vi.advanceTimersByTimeAsync(300);

    useSettingsStore.setState({ appIconBadge: false });
    await vi.advanceTimersByTimeAsync(300);
    expect(badge.mock.calls).toEqual([[2], [0]]);

    useSettingsStore.setState({ appIconBadge: true });
    await vi.advanceTimersByTimeAsync(300);
    expect(badge.mock.calls).toEqual([[2], [0], [2]]);
  });

  it("tries again after the icon couldn't be set", async () => {
    badge.mockImplementationOnce(() => Promise.reject(new Error("no window")));
    stop = watchAttentionBadge();
    await vi.advanceTimersByTimeAsync(300);

    useAppStore.setState({ projects: [...useAppStore.getState().projects] });
    await vi.advanceTimersByTimeAsync(300);
    expect(badge.mock.calls).toEqual([[2], [2]]);
  });
});

describe("appIconBadgeWords", () => {
  it("names where each system shows the count", () => {
    expect(appIconBadgeWords("macos").label).toBe("Count on the Dock icon");
    expect(appIconBadgeWords("windows").label).toBe("Count on the taskbar button");
    expect(appIconBadgeWords("linux").label).toBe("Count on the launcher icon");
    expect(appIconBadgeWords("linux").description).toMatch(/docks that show counts$/);
  });
});
