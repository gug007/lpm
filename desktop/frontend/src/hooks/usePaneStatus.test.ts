import { describe, expect, it } from "vitest";
import { derivePaneStatus, paneAgentStatus } from "./usePaneStatus";
import {
  STATUS_DONE,
  STATUS_ERROR,
  STATUS_RUNNING,
  STATUS_WAITING,
  type StatusEntry,
} from "../types";

const NOW = 1_700_000_000_000;

const entry = (
  key: string,
  value: string,
  paneID: string,
  timestamp = NOW - 60_000,
  turn?: { turnStart?: number; endedAt?: number },
): StatusEntry => ({ key, value, priority: 0, timestamp, paneID, ...turn });

describe("derivePaneStatus", () => {
  it("buckets entries by pane and reads how long each has been that way", () => {
    const s = derivePaneStatus(
      [
        entry("claude_code_a", STATUS_RUNNING, "%1", NOW - 90_000),
        entry("codex_b", STATUS_WAITING, "%2", NOW - 5_000),
      ],
      NOW,
    );
    expect([...s.running]).toEqual(["%1"]);
    expect([...s.waiting]).toEqual(["%2"]);
    expect(s.agents.get("%1")).toEqual({ state: "working", since: NOW - 90_000 });
    expect(s.agents.get("%2")).toEqual({ state: "needs-you", since: NOW - 5_000 });
  });

  it("ignores entries with no pane", () => {
    const s = derivePaneStatus(
      [{ key: "k", value: STATUS_RUNNING, priority: 0, timestamp: NOW }],
      NOW,
    );
    expect(s.running.size).toBe(0);
    expect(s.agents.size).toBe(0);
  });

  it("takes the most urgent state when a pane carries several", () => {
    const s = derivePaneStatus(
      [
        entry("a", STATUS_DONE, "%1", NOW - 1_000),
        entry("b", STATUS_WAITING, "%1", NOW - 30_000),
      ],
      NOW,
    );
    expect(paneAgentStatus(s, "%1")).toEqual({
      state: "needs-you",
      since: NOW - 30_000,
    });
  });

  // A paired Mac stamps with its own clock, which can run ahead of ours.
  it("clamps a future stamp to now, and stands in for a missing one", () => {
    const s = derivePaneStatus(
      [
        entry("a", STATUS_RUNNING, "%1", NOW + 60_000),
        { key: "b", value: STATUS_ERROR, priority: 0, timestamp: 0, paneID: "%2" },
      ],
      NOW,
    );
    expect(s.agents.get("%1")?.since).toBe(NOW);
    expect(s.agents.get("%2")?.since).toBe(NOW);
  });

  it("counts a working turn from when it began, not from the last approval", () => {
    const s = derivePaneStatus(
      [entry("a", STATUS_RUNNING, "%1", NOW - 10_000, { turnStart: NOW - 300_000 })],
      NOW,
    );
    expect(s.agents.get("%1")).toEqual({ state: "working", since: NOW - 300_000 });
  });

  it("freezes a finished turn at how long the work took", () => {
    const s = derivePaneStatus(
      [
        entry("a", STATUS_DONE, "%1", NOW - 60_000, {
          turnStart: NOW - 300_000,
          endedAt: NOW - 60_000,
        }),
      ],
      NOW,
    );
    expect(s.agents.get("%1")).toEqual({
      state: "done",
      since: NOW - 300_000,
      until: NOW - 60_000,
    });
  });

  it("reports no reading for a finish whose start was never seen", () => {
    const s = derivePaneStatus(
      [entry("a", STATUS_DONE, "%1", NOW - 60_000, { endedAt: NOW - 60_000 })],
      NOW,
    );
    expect(s.agents.get("%1")?.since).toBeNull();
  });

  // Waiting is the one wait you care about the length of, so it keeps reading
  // from when it started rather than from the turn's start.
  it("keeps a wait reading from when the wait started", () => {
    const s = derivePaneStatus(
      [entry("a", STATUS_WAITING, "%1", NOW - 10_000, { turnStart: NOW - 300_000 })],
      NOW,
    );
    expect(s.agents.get("%1")).toEqual({ state: "needs-you", since: NOW - 10_000 });
  });
});

describe("paneAgentStatus", () => {
  it("is null for a terminal no agent reports on", () => {
    const s = derivePaneStatus([entry("a", STATUS_RUNNING, "%1")], NOW);
    expect(paneAgentStatus(s, "%2")).toBeNull();
    expect(paneAgentStatus(s, null)).toBeNull();
    expect(paneAgentStatus(undefined, "%1")).toBeNull();
  });

  it("maps each status to its product state", () => {
    const s = derivePaneStatus(
      [
        entry("a", STATUS_RUNNING, "%1"),
        entry("b", STATUS_DONE, "%2"),
        entry("c", STATUS_ERROR, "%3"),
        entry("d", STATUS_WAITING, "%4"),
      ],
      NOW,
    );
    expect(paneAgentStatus(s, "%1")?.state).toBe("working");
    expect(paneAgentStatus(s, "%2")?.state).toBe("done");
    expect(paneAgentStatus(s, "%3")?.state).toBe("error");
    expect(paneAgentStatus(s, "%4")?.state).toBe("needs-you");
  });
});
