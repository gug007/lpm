import { describe, expect, it } from "vitest";
import { rollupSegments, visibleRollup } from "./sidebarRollup";
import {
  STATUS_DONE,
  STATUS_ERROR,
  STATUS_RUNNING,
  STATUS_WAITING,
  type ProjectInfo,
  type StatusEntry,
} from "../types";

function project(overrides: Partial<ProjectInfo> = {}): ProjectInfo {
  return {
    name: "app",
    session: "",
    root: "/tmp/app",
    running: false,
    services: [],
    allServices: [],
    actions: [],
    profiles: [],
    activeProfile: "",
    statusEntries: [],
    isRemote: false,
    ...overrides,
  };
}

function entries(...values: string[]): StatusEntry[] {
  return values.map((value, i) => ({
    key: `claude_code_${i}`,
    value,
    priority: 0,
    timestamp: 0,
  }));
}

function withStatus(name: string, ...values: string[]): ProjectInfo {
  return project({ name, statusEntries: entries(...values) });
}

describe("rollupSegments", () => {
  it("orders segments by urgency, with running last", () => {
    const segments = rollupSegments([
      project({ name: "up", running: true }),
      withStatus("a", STATUS_RUNNING),
      withStatus("b", STATUS_ERROR),
      withStatus("c", STATUS_WAITING),
    ]);
    expect(segments.map((s) => s.key)).toEqual(["needs-you", "error", "working", "running"]);
  });

  it("pluralises only the label that is a noun", () => {
    const one = rollupSegments([withStatus("a", STATUS_ERROR, STATUS_WAITING)]);
    expect(one.map((s) => s.text)).toEqual(["1 needs you", "1 problem"]);

    const many = rollupSegments([
      withStatus("a", STATUS_ERROR, STATUS_WAITING, STATUS_RUNNING),
      withStatus("b", STATUS_ERROR, STATUS_WAITING, STATUS_RUNNING),
    ]);
    expect(many.map((s) => s.text)).toEqual(["2 needs you", "2 problems", "2 working"]);
  });

  it("counts a project that is merely running, without any agent", () => {
    const segments = rollupSegments([
      project({ name: "up", running: true }),
      project({ name: "also-up", running: true }),
    ]);
    expect(segments).toEqual([
      { key: "running", text: "2 running", className: "text-[var(--accent-green-text)]" },
    ]);
  });

  it("says nothing about done, idle or stopped projects", () => {
    expect(rollupSegments([withStatus("a", STATUS_DONE), withStatus("b", "Whatever")])).toEqual([]);
    expect(rollupSegments([])).toEqual([]);
  });

  it("colours each kind from the sidebar's own vocabulary", () => {
    const segments = rollupSegments([
      project({ name: "up", running: true, statusEntries: entries(STATUS_WAITING, STATUS_ERROR, STATUS_RUNNING) }),
    ]);
    expect(segments.map((s) => s.className)).toEqual([
      "sidebar-waiting",
      "text-[var(--accent-red-text)]",
      "text-[var(--accent-cyan-text)]",
      "text-[var(--accent-green-text)]",
    ]);
  });
});

describe("visibleRollup", () => {
  it("keeps the two most urgent segments and counts the rest", () => {
    const segments = rollupSegments([
      project({ name: "up", running: true, statusEntries: entries(STATUS_WAITING, STATUS_ERROR, STATUS_RUNNING) }),
    ]);
    const { shown, overflow } = visibleRollup(segments);
    expect(shown.map((s) => s.key)).toEqual(["needs-you", "error"]);
    expect(overflow).toBe(2);
  });

  it("reports no overflow when everything fits", () => {
    const segments = rollupSegments([withStatus("a", STATUS_WAITING)]);
    expect(visibleRollup(segments)).toEqual({ shown: segments, overflow: 0 });
  });
});
