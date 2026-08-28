import { describe, expect, it } from "vitest";
import type { AgentCapability } from "./toolkit";
import { faultState, panelMeta, pluginContribution, rowMeta, rowSummary } from "./toolkitRowText";

function cap(over: Partial<AgentCapability> = {}): AgentCapability {
  return {
    id: "claude:skill:plugin:figma@official/figma-use",
    kind: "skill",
    name: "figma-use",
    cli: "claude",
    scope: "plugin",
    path: "/h/.claude/plugins/figma/skills/figma-use/SKILL.md",
    description: "Use Figma.",
    detail: "figma@official",
    enabled: true,
    editable: false,
    shadowedBy: "",
    problem: "",
    blocking: false,
    bytes: 0,
    ...over,
  };
}

const plugin = cap({
  kind: "plugin",
  name: "figma@official",
  detail: "official",
  scope: "user",
  description: "",
});

describe("pluginContribution", () => {
  it("counts what the plugin shipped, by kind, in a fixed order", () => {
    const all = [
      plugin,
      cap({ id: "a", name: "figma-use" }),
      cap({ id: "b", name: "figma-use-slides" }),
      cap({ id: "c", name: "plugin:figma:figma", kind: "mcp" }),
    ];
    expect(pluginContribution(plugin, all)).toBe("2 skills, 1 MCP server");
  });

  it("singularises, and never counts another plugin's items", () => {
    const all = [
      plugin,
      cap({ id: "a" }),
      cap({ id: "d", name: "ctx", detail: "context7@official" }),
    ];
    expect(pluginContribution(plugin, all)).toBe("1 skill");
  });

  it("says nothing rather than lying when a plugin ships nothing yet", () => {
    expect(pluginContribution(plugin, [plugin])).toBe("");
  });
});

describe("rowSummary", () => {
  it("leaves non-plugin rows to their own description", () => {
    expect(rowSummary(cap({ description: "Ship the thing." }), [])).toBe("Ship the thing.");
  });

  // The count comes from every scanned item, so filtering the list cannot
  // change what a plugin is reported to contribute.
  it("counts a plugin's items even when they are filtered out of view", () => {
    const all = [plugin, cap({ id: "a" })];
    expect(rowSummary(plugin, all)).toBe("1 skill");
  });
});

const own = (over: Partial<AgentCapability> = {}) =>
  cap({ scope: "user", detail: "", name: "deploy", ...over });

describe("faultState", () => {
  it("names each way a row can fail to do what the repo implies", () => {
    expect(faultState(cap({ shadowedBy: "/h/.claude/skills/run/SKILL.md" }))).toBe("shadowed");
    expect(faultState(cap({ problem: "not trusted", blocking: true }))).toBe("blocked");
    expect(faultState(cap({ problem: "key in the repo" }))).toBe("loads anyway");
    expect(faultState(cap({ enabled: false }))).toBe("off");
  });

  it("says nothing about a healthy row", () => {
    expect(faultState(cap())).toBe("");
  });
});

describe("rowMeta", () => {
  it("stays silent for the ordinary case", () => {
    expect(rowMeta(own())).toBe("");
  });

  it("names the scope only when it is not the obvious one", () => {
    expect(rowMeta(own({ scope: "project" }))).toBe("project");
    expect(rowMeta(cap())).toBe("figma@official plugin");
  });

  it("names the CLI only while both are listed together", () => {
    expect(rowMeta(own({ cli: "codex" }))).toBe("");
    expect(rowMeta(own({ cli: "codex" }), true)).toBe("codex");
  });

  // The estimate alone cannot explain a zero-cost skill; the word does.
  it("marks a skill only the user can run", () => {
    expect(rowMeta(own({ manual: true }))).toBe("manual");
    expect(rowMeta(own({ manual: true, cli: "codex" }), true)).toBe("manual · codex");
  });

  it("prints a figure only where the numbers actually differ", () => {
    const file = own({ kind: "instructions", name: "CLAUDE.md", bytes: 12800 });
    expect(rowMeta(file)).toBe("~3.2k est");
    expect(rowMeta(own({ description: "x".repeat(400) }))).toBe("");
  });
});

describe("panelMeta", () => {
  it("counts, costs, and says where the missing ones went", () => {
    expect(panelMeta("skill", 17, 11600, 1)).toBe("17 · 1 flagged above · ~2.9k est up front");
  });

  it("explains a kind that costs nothing up front", () => {
    expect(panelMeta("command", 4, 0, 0)).toBe("4 · loaded only when you run one");
    expect(panelMeta("mcp", 5, 0, 2)).toBe("5 · 2 flagged above · schemas not counted");
  });

  it("has nothing to explain for a pile with no kind", () => {
    expect(panelMeta(null, 3, 0, 0)).toBe("3");
  });
});
