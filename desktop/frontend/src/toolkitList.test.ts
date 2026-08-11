import { describe, expect, it } from "vitest";
import type { AgentCapability } from "./toolkit";
import { buildList, toPanels, visibleItems } from "./toolkitList";

const cap = (over: Partial<AgentCapability> = {}): AgentCapability => ({
  id: over.name ?? "id",
  kind: "skill",
  name: "deploy",
  cli: "claude",
  scope: "user",
  path: "/h/.claude/skills/deploy/SKILL.md",
  description: "",
  detail: "",
  enabled: true,
  editable: true,
  shadowedBy: "",
  problem: "",
  blocking: false,
  bytes: 0,
  ...over,
});

const NONE: ReadonlySet<string> = new Set();
const groupIds = (items: AgentCapability[], expanded = NONE) =>
  buildList(items, expanded).flatMap((n) => (n.type === "group" ? [n.id] : []));

describe("buildList sections", () => {
  it("does not call a deliberately disabled capability a problem", () => {
    const nodes = buildList([cap({ name: "computer-use", enabled: false })], NONE);
    expect(nodes.some((n) => n.type === "section" && n.id === "attention")).toBe(false);
    expect(nodes.some((n) => n.type === "group" && n.id === "inactive")).toBe(true);
  });

  it("does flag a shadowed or failing capability", () => {
    const nodes = buildList(
      [cap({ name: "a", shadowedBy: "/x" }), cap({ name: "b", problem: "boom" })],
      NONE,
    );
    const attention = nodes.find((n) => n.type === "section" && n.id === "attention");
    expect(attention).toMatchObject({ count: 2, tone: "warn" });
  });

  it("measures a section by what it costs up front, not by file size", () => {
    // 40KB of SKILL.md bodies that the agent loads only on demand.
    const nodes = buildList(
      [cap({ name: "big", kind: "skill", description: "Ships", bytes: 40000 })],
      NONE,
    );
    const section = nodes.find((n) => n.type === "section" && n.id === "kind:skill");
    expect(section).toMatchObject({ bytes: "big".length + "Ships".length });
  });
});

describe("buildList plugin grouping", () => {
  const items = [
    cap({ name: "mine", scope: "user" }),
    cap({ name: "figma-use", scope: "plugin", detail: "figma@official" }),
    cap({ name: "figma-swiftui", scope: "plugin", detail: "figma@official" }),
    cap({ name: "fd", scope: "plugin", detail: "frontend-design@official" }),
  ];

  it("folds each plugin's block away by default, keeping the user's own visible", () => {
    const nodes = buildList(items, NONE);
    expect(visibleItems(nodes).map((c) => c.name)).toEqual(["mine"]);
    expect(groupIds(items)).toEqual(["skill:figma@official", "skill:frontend-design@official"]);
  });

  // The pane decides whether to show "No matches" from the node list, not the
  // row list: with every member folded away there are no rows, but there is
  // plenty on screen, and the chip beside it reads a non-zero count.
  it("still emits a heading when every member is folded out of view", () => {
    const onlyPlugin = items.filter((c) => c.scope === "plugin");
    const nodes = buildList(onlyPlugin, NONE);
    expect(visibleItems(nodes)).toHaveLength(0);
    expect(nodes.length).toBeGreaterThan(0);
  });

  it("shows a plugin's members once expanded, nested under it", () => {
    const nodes = buildList(items, new Set(["skill:figma@official"]));
    expect(visibleItems(nodes).map((c) => c.name)).toEqual([
      "mine",
      "figma-use",
      "figma-swiftui",
    ]);
    expect(nodes.filter((n) => n.type === "item" && n.nested)).toHaveLength(2);
  });

  it("counts a folded plugin's members in its header", () => {
    const header = buildList(items, NONE).find(
      (n) => n.type === "group" && n.id === "skill:figma@official",
    );
    expect(header).toMatchObject({ count: 2, open: false });
  });
});

describe("buildList indexing", () => {
  it("numbers only the rows on screen, so Enter cannot open a hidden one", () => {
    const items = [
      cap({ name: "visible" }),
      cap({ name: "folded", scope: "plugin", detail: "p@m" }),
      cap({ name: "off", enabled: false }),
    ];
    const nodes = buildList(items, NONE);
    const indexes = nodes.flatMap((n) => (n.type === "item" ? [n.index] : []));
    expect(indexes).toEqual([0]);
    expect(visibleItems(nodes)).toHaveLength(1);
  });

  it("renumbers contiguously from zero as groups open", () => {
    const items = [
      cap({ name: "a" }),
      cap({ name: "b", scope: "plugin", detail: "p@m" }),
      cap({ name: "c", scope: "plugin", detail: "p@m" }),
    ];
    const nodes = buildList(items, new Set(["skill:p@m"]));
    const indexes = nodes.flatMap((n) => (n.type === "item" ? [n.index] : []));
    expect(indexes).toEqual([0, 1, 2]);
  });

  it("keeps index order and visibleItems order in lockstep", () => {
    const items = [
      cap({ name: "broken", problem: "boom" }),
      cap({ name: "mcp", kind: "mcp" }),
      cap({ name: "skill" }),
    ];
    const nodes = buildList(items, NONE);
    const byIndex = nodes
      .flatMap((n) => (n.type === "item" ? [n] : []))
      .sort((a, b) => a.index - b.index)
      .map((n) => n.cap.name);
    expect(byIndex).toEqual(visibleItems(nodes).map((c) => c.name));
    expect(byIndex).toEqual(["broken", "mcp", "skill"]);
  });
});

describe("toPanels", () => {
  const panels = (items: AgentCapability[], expanded = NONE) =>
    toPanels(buildList(items, expanded));

  it("turns every section into a panel and hands it the rows beneath", () => {
    const built = panels([
      cap({ name: "deploy" }),
      cap({ name: "chrome", kind: "mcp" }),
    ]);
    expect(built.map((p) => [p.label, p.nodes.length])).toEqual([
      ["MCP servers", 1],
      ["Skills", 1],
    ]);
    expect(built.every((p) => p.tone === "plain")).toBe(true);
  });

  it("marks the faults panel so it can carry the one accent", () => {
    const built = panels([cap({ name: "broken", problem: "not trusted", blocking: true })]);
    expect(built[0]).toMatchObject({ label: "Needs attention", tone: "warn", count: 1 });
  });

  it("gives the disabled pile a panel of its own rather than the last kind's", () => {
    const built = panels([cap({ name: "deploy" }), cap({ name: "gmail", enabled: false })]);
    expect(built.map((p) => p.label)).toEqual(["Skills", "Disabled"]);
    expect(built[1]).toMatchObject({ tone: "off", toggle: "inactive", open: false });
    expect(built[0].nodes).toHaveLength(1);
  });

  it("holds the disabled rows once the pile is opened", () => {
    const built = panels([cap({ name: "gmail", enabled: false })], new Set(["inactive"]));
    expect(built[0].nodes).toHaveLength(1);
  });

  it("keeps a plugin's block inside the kind it belongs to", () => {
    const built = panels([
      cap({ name: "mine" }),
      cap({ name: "figma-use", scope: "plugin", detail: "figma" }),
    ]);
    expect(built).toHaveLength(1);
    expect(built[0].nodes.map((n) => n.type)).toEqual(["item", "group"]);
    expect(built[0].kind).toBe("skill");
  });
});
