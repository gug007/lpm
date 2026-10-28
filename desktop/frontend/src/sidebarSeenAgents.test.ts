import { describe, expect, it } from "vitest";
import { canArchive, foldSeenRows, sidebarAgentRows } from "./sidebarSeenAgents";
import type { SidebarAgentRow } from "./sidebarAgents";
import type { StatusEntry } from "./types";

const entry = (key: string, value: string, paneID: string, over: Partial<StatusEntry> = {}): StatusEntry => ({
  key,
  value,
  priority: 0,
  timestamp: 1_000,
  paneID,
  ...over,
});

const titles = { "t-1": "Fix auth", "t-2": "Migrate", "t-3": "Review" };

describe("sidebarAgentRows", () => {
  it("puts seen agents back in their tabs' places, muted and silent", () => {
    const rows = sidebarAgentRows(
      {
        statusEntries: [entry("claude_code_b", "Running", "t-2")],
        seenEntries: [
          entry("claude_code_c", "Error", "t-3", { seenAt: 5_000 }),
          entry("claude_code_a", "Done", "t-1", { seenAt: 4_000 }),
        ],
      },
      9_000,
      titles,
    );
    expect(rows.map((r) => [r.title, r.seenAt])).toEqual([
      ["Fix auth", 4_000],
      ["Migrate", undefined],
      ["Review", 5_000],
    ]);
    expect(rows[2].holdsError).toBe(false);
  });

  it("lets a tab's newer news speak for it", () => {
    const rows = sidebarAgentRows(
      {
        statusEntries: [entry("claude_code_new", "Running", "t-1")],
        seenEntries: [entry("claude_code_old", "Done", "t-1", { seenAt: 1 })],
      },
      9_000,
      titles,
    );
    expect(rows.map((r) => r.key)).toEqual(["claude_code_new"]);
  });

  it("leaves out rows waiting on their archive's Undo", () => {
    const rows = sidebarAgentRows(
      {
        statusEntries: [entry("a", "Done", "t-1")],
        seenEntries: [entry("b", "Done", "t-2", { seenAt: 1 })],
      },
      9_000,
      titles,
      new Set(["a", "b"]),
    );
    expect(rows).toEqual([]);
  });

  it("stands for every agent folded into a tab", () => {
    const [row] = sidebarAgentRows(
      { statusEntries: [entry("a", "Done", "t-1"), entry("b", "Done", "t-1")], seenEntries: [] },
      9_000,
      titles,
    );
    expect(row.keys.sort()).toEqual(["a", "b"]);
  });
});

const row = (key: string, over: Partial<SidebarAgentRow> = {}): SidebarAgentRow => ({
  key,
  state: "done",
  title: key,
  provider: "Claude Code",
  terminalId: `t-${key}`,
  since: null,
  shared: 0,
  holdsError: false,
  keys: [key],
  ...over,
});

describe("foldSeenRows", () => {
  const rows = [
    row("new"),
    row("s1", { seenAt: 1 }),
    row("s2", { seenAt: 2 }),
    row("s3", { seenAt: 3 }),
    row("work", { state: "working" }),
  ];

  it("keeps the most recently seen and folds the rest in order", () => {
    const { shown, folded } = foldSeenRows(rows, 2, null);
    expect(shown.map((r) => r.key)).toEqual(["new", "s2", "s3", "work"]);
    expect(folded.map((r) => r.key)).toEqual(["s1"]);
  });

  it("never folds the agent on screen", () => {
    expect(foldSeenRows(rows, 1, "t-s1").folded.map((r) => r.key)).toEqual(["s2"]);
  });

  it("folds nothing within the limit", () => {
    expect(foldSeenRows(rows, 3, null).folded).toEqual([]);
  });
});

describe("canArchive", () => {
  it("takes only a turn that ended", () => {
    expect(canArchive(row("a"))).toBe(true);
    expect(canArchive(row("a", { state: "error" }))).toBe(true);
    expect(canArchive(row("a", { state: "working" }))).toBe(false);
    expect(canArchive(row("a", { state: "needs-you" }))).toBe(false);
  });
});
