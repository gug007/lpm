import { describe, expect, it } from "vitest";
import type { AgentCapability } from "./toolkit";
import { pluginContribution, rowSummary } from "./toolkitRowText";

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
