import { describe, expect, it } from "vitest";
import { byUrgency, foldByPane } from "./statusByPane";
import { STATUS_DONE, STATUS_RUNNING, STATUS_WAITING, type StatusEntry } from "./types";

const T0 = 1_700_000_000_000;

const entry = (key: string, value: string, paneID: string | undefined, ago = 0): StatusEntry => ({
  key,
  value,
  priority: 0,
  timestamp: T0 - ago,
  ...(paneID === undefined ? {} : { paneID }),
});

describe("foldByPane", () => {
  it("gives a tab one place, however many agents report on it", () => {
    const held = foldByPane([
      entry("claude_code_a", STATUS_RUNNING, "pty-1"),
      entry("claude_code_nested", STATUS_DONE, "pty-1"),
      entry("claude_code_also", STATUS_RUNNING, "pty-1"),
      entry("codex_pty-2", STATUS_RUNNING, "pty-2"),
    ]);
    expect(held.map((h) => [h.entry.key, h.folded.length])).toEqual([
      ["claude_code_a", 2],
      ["codex_pty-2", 0],
    ]);
  });

  it("keeps the first of a tab's agents, which sorting has made the most urgent", () => {
    const sorted = [
      entry("claude_code_a", STATUS_RUNNING, "pty-1", 60_000),
      entry("claude_code_b", STATUS_WAITING, "pty-1", 30_000),
    ].sort(byUrgency);
    const held = foldByPane(sorted);
    expect(held).toHaveLength(1);
    expect(held[0].entry.key).toBe("claude_code_b");
    expect(held[0].folded.map((e) => e.key)).toEqual(["claude_code_a"]);
  });

  it("folds nothing when every agent has a tab of its own", () => {
    const held = foldByPane([
      entry("codex_pty-1", STATUS_RUNNING, "pty-1"),
      entry("codex_pty-2", STATUS_RUNNING, "pty-2"),
    ]);
    expect(held.map((h) => h.folded.length)).toEqual([0, 0]);
  });

  it("never folds agents that name no tab, which are nobody's duplicate", () => {
    // `lpm set-status` leaves --pane optional; folding these would merge every
    // scripted status a project has into one line.
    const held = foldByPane([
      entry("deploy", STATUS_RUNNING, undefined),
      entry("backup", STATUS_DONE, ""),
      entry("lint", STATUS_RUNNING, undefined),
    ]);
    expect(held.map((h) => h.entry.key)).toEqual(["deploy", "backup", "lint"]);
    expect(held.every((h) => h.folded.length === 0)).toBe(true);
  });

  it("has nothing to fold in an empty list", () => {
    expect(foldByPane([])).toEqual([]);
  });
});

describe("byUrgency", () => {
  it("ranks a wait over work, and the more recent of two equals first", () => {
    const rows = [
      entry("a", STATUS_DONE, "pty-1", 1_000),
      entry("b", STATUS_RUNNING, "pty-2", 60_000),
      entry("c", STATUS_WAITING, "pty-3", 90_000),
      entry("d", STATUS_RUNNING, "pty-4", 5_000),
    ].sort(byUrgency);
    expect(rows.map((r) => r.key)).toEqual(["c", "d", "b", "a"]);
  });
});
