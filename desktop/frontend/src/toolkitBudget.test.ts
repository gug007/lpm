import { describe, expect, it } from "vitest";
import type { AgentCapability } from "./toolkit";
import { axisTicks, buildLedger, excludedSummary, hasBudget } from "./toolkitBudget";

function cap(over: Partial<AgentCapability> = {}): AgentCapability {
  return {
    id: "claude:skill:user:deploy",
    kind: "skill",
    name: "deploy",
    cli: "claude",
    scope: "user",
    path: "/Users/dev/.claude/skills/deploy/SKILL.md",
    description: "Ship it",
    detail: "",
    enabled: true,
    editable: true,
    shadowedBy: "",
    problem: "",
    blocking: false,
    bytes: 0,
    ...over,
  };
}

function instructions(over: Partial<AgentCapability> = {}): AgentCapability {
  return cap({
    id: `claude:instructions:${over.scope ?? "user"}:${over.name ?? "CLAUDE.md"}`,
    kind: "instructions",
    name: "CLAUDE.md",
    path: "/Users/dev/.claude/CLAUDE.md",
    bytes: 4000,
    ...over,
  });
}

describe("buildLedger", () => {
  it("gives every instructions file its own block, largest first", () => {
    const ledger = buildLedger([
      instructions({ name: "AGENTS.md", scope: "project", path: "/w/AGENTS.md", bytes: 2400 }),
      instructions({ bytes: 12800 }),
    ]);

    expect(ledger.segments.map((s) => s.label)).toEqual(["CLAUDE.md", "AGENTS.md"]);
    expect(ledger.segments.map((s) => s.bytes)).toEqual([12800, 2400]);
    expect(ledger.bytes).toBe(15200);
  });

  it("names the scope when two instruction files share a basename", () => {
    const ledger = buildLedger([
      instructions({ bytes: 12800 }),
      instructions({ scope: "project", path: "/w/CLAUDE.md", bytes: 400 }),
    ]);

    expect(ledger.segments.map((s) => s.label)).toEqual([
      "CLAUDE.md · user",
      "CLAUDE.md · project",
    ]);
  });

  it("aggregates skills and subagents, which each cost one description", () => {
    const ledger = buildLedger([
      cap({ id: "a", name: "deploy", description: "x".repeat(200) }),
      cap({ id: "b", name: "review", description: "y".repeat(100) }),
      cap({ id: "c", kind: "subagent", name: "Plan", description: "z".repeat(50) }),
    ]);

    expect(ledger.segments.map((s) => s.label)).toEqual([
      "2 skill descriptions",
      "1 subagent description",
    ]);
    expect(ledger.skills).toBe(2);
    expect(ledger.subagents).toBe(1);
  });

  it("leaves out what never reaches the model and says so", () => {
    const ledger = buildLedger([
      instructions({ bytes: 4000 }),
      instructions({
        name: "AGENTS.md",
        scope: "project",
        path: "/w/AGENTS.md",
        bytes: 9000,
        shadowedBy: "/Users/dev/.claude/AGENTS.md",
      }),
      cap({ id: "off", name: "old", enabled: false, description: "x".repeat(500) }),
      cap({ id: "cmd", kind: "command", name: "/release" }),
      cap({ id: "hook", kind: "hook", name: "SessionStart" }),
    ]);

    expect(ledger.bytes).toBe(4000);
    expect(ledger.segments).toHaveLength(1);
    expect(excludedSummary(ledger)).toBe(
      "skill and subagent bodies, read only when used · 1 command, loaded on invocation · 1 hook · 1 shadowed copy · 1 switched off",
    );
  });

  it("counts MCP servers that load but excludes them from the figure", () => {
    const ledger = buildLedger([
      instructions({ bytes: 4000 }),
      cap({ id: "m1", kind: "mcp", name: "chrome", bytes: 900 }),
      cap({ id: "m2", kind: "mcp", name: "postgres", problem: "not trusted", blocking: true }),
    ]);

    expect(ledger.bytes).toBe(4000);
    expect(ledger.servers).toBe(1);
    expect(hasBudget(ledger)).toBe(true);
  });

  it("still reports servers when nothing measurable loads", () => {
    const ledger = buildLedger([cap({ id: "m1", kind: "mcp", name: "chrome" })]);

    expect(ledger.bytes).toBe(0);
    expect(hasBudget(ledger)).toBe(true);
  });

  it("is empty when there is nothing to report", () => {
    expect(hasBudget(buildLedger([cap({ kind: "command", name: "/release" })]))).toBe(false);
  });
});

describe("axisTicks", () => {
  it("walks round numbers up to the total", () => {
    expect(axisTicks(33200).map((t) => t.tokens)).toEqual([0, 2500, 5000, 8300]);
  });

  it("drops a round tick that would collide with the total", () => {
    expect(axisTicks(40000).map((t) => t.tokens)).toEqual([0, 2500, 5000, 7500, 10000]);
  });

  it("places each tick at its share of the bar", () => {
    const ticks = axisTicks(33200);
    expect(ticks[0].at).toBe(0);
    expect(ticks[ticks.length - 1].at).toBe(1);
    expect(ticks[1].at).toBeCloseTo(2500 / 8300, 5);
  });

  it("has nothing to draw for an empty budget", () => {
    expect(axisTicks(0)).toEqual([]);
  });
});
