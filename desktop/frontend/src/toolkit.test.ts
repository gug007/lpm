import { describe, expect, it } from "vitest";
import type { AgentCapability, CapabilityKind } from "./toolkit";
import {
  capabilityIssue,
  formatTokens,
  costsContext,
  groupByKind,
  loads,
  manualOnly,
  needsAttention,
  shortDescription,
  shortPath,
  splitFrontmatter,
  totalBytes,
  uncountedServers,
  upfrontBytes,
  upfrontTotal,
} from "./toolkit";

function cap(over: Partial<AgentCapability> = {}): AgentCapability {
  return {
    id: "claude:skill:user:deploy",
    kind: "skill",
    name: "deploy",
    cli: "claude",
    scope: "user",
    path: "/h/.claude/skills/deploy/SKILL.md",
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

describe("capabilityIssue", () => {
  it("says nothing about a healthy capability", () => {
    expect(capabilityIssue(cap())).toBeNull();
  });

  it("names the winner and states the rule when shadowed", () => {
    const issue = capabilityIssue(
      cap({ scope: "project", shadowedBy: "/Users/ada/.claude/skills/deploy/SKILL.md" }),
    );
    expect(issue).toContain("~/.claude/skills/deploy/SKILL.md");
    expect(issue).toContain("personal copy");
  });

  it("gives subagents their own rule, which points the other way", () => {
    const issue = capabilityIssue(
      cap({ kind: "subagent", scope: "user", shadowedBy: "/p/.claude/agents/review.md" }),
    );
    expect(issue).toContain("project copy beats");
  });

  it("shadowing outranks a disabled flag, since it explains more", () => {
    const issue = capabilityIssue(cap({ enabled: false, shadowedBy: "/h/x/SKILL.md" }));
    expect(issue).toContain("Shadowed by");
  });

  it("says nothing about a capability that is merely switched off", () => {
    expect(capabilityIssue(cap({ enabled: false }))).toBeNull();
  });

  it("passes a backend problem through verbatim", () => {
    const problem = "pending approval — this directory is not trusted yet";
    expect(capabilityIssue(cap({ problem }))).toBe(problem);
  });
});

describe("loads / needsAttention / costsContext", () => {
  it("covers problems, shadowing and the off switch", () => {
    expect(loads(cap())).toBe(true);
    expect(loads(cap({ problem: "boom" }))).toBe(false);
    expect(loads(cap({ shadowedBy: "/x" }))).toBe(false);
    expect(loads(cap({ enabled: false }))).toBe(false);
  });

  // Turning something off is a decision the user already made. Flagging it as
  // a fault trains them to ignore the warning that matters.
  it("does not demand attention for a deliberately disabled capability", () => {
    expect(needsAttention(cap({ enabled: false }))).toBe(false);
    expect(needsAttention(cap({ problem: "boom" }))).toBe(true);
    expect(needsAttention(cap({ shadowedBy: "/x" }))).toBe(true);
    expect(needsAttention(cap())).toBe(false);
  });

  // An ambiguous tie marks BOTH candidates, and one of them wins. Zeroing them
  // would under-report the cost by exactly the amount that does load.
  it("keeps counting a capability whose problem does not stop it loading", () => {
    const tie = { problem: "ambiguous — the CLI does not define which of these wins" };
    expect(costsContext(cap(tie))).toBe(true);
    expect(upfrontBytes(cap({ ...tie, kind: "instructions", bytes: 400 }))).toBe(400);
  });

  it("stops counting one that is genuinely blocked, or shadowed, or off", () => {
    const blocked = { problem: "not trusted yet", blocking: true };
    expect(costsContext(cap(blocked))).toBe(false);
    expect(upfrontBytes(cap({ ...blocked, kind: "instructions", bytes: 400 }))).toBe(0);
    expect(costsContext(cap({ shadowedBy: "/x" }))).toBe(false);
    expect(costsContext(cap({ enabled: false }))).toBe(false);
  });

  // The caveat beside the headline counts servers whose schemas load. A literal
  // API key is worth flagging and does not stop the server starting.
  it("counts a server flagged for a secret, but not one that never starts", () => {
    const servers = [
      cap({ kind: "mcp" }),
      cap({ kind: "mcp", problem: "API_KEY holds a literal value" }),
      cap({ kind: "mcp", problem: "plugin is not enabled", blocking: true }),
    ];
    expect(uncountedServers(servers)).toBe(2);
  });
});

describe("formatTokens", () => {
  it("is a bytes/4 estimate, abbreviated past a thousand", () => {
    expect(formatTokens(400)).toBe("100");
    expect(formatTokens(8000)).toBe("2.0k");
    expect(formatTokens(0)).toBe("0");
  });
});

describe("groupByKind", () => {
  it("orders MCP before skills and drops empty kinds", () => {
    const groups = groupByKind([
      cap({ kind: "command", id: "a" }),
      cap({ kind: "mcp", id: "b", bytes: 400 }),
      cap({ kind: "skill", id: "c", bytes: 200 }),
    ]);
    expect(groups.map((g) => g.kind)).toEqual<CapabilityKind[]>(["mcp", "skill", "command"]);
    expect(groups[0].bytes).toBe(400);
  });

  it("sums the bytes of every member of a group", () => {
    const groups = groupByKind([
      cap({ kind: "skill", id: "a", bytes: 100 }),
      cap({ kind: "skill", id: "b", bytes: 300 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].bytes).toBe(400);
  });
});

describe("splitFrontmatter", () => {
  it("lifts top-level keys out and leaves the body behind", () => {
    const { fields, body } = splitFrontmatter(
      "---\nname: deploy\ndescription: Ship it\n---\n\n# Deploy\n\nProse.",
    );
    expect(fields).toEqual([
      { key: "name", value: "deploy" },
      { key: "description", value: "Ship it" },
    ]);
    expect(body.trim()).toBe("# Deploy\n\nProse.");
  });

  it("strips surrounding quotes from a value", () => {
    const { fields } = splitFrontmatter('---\nname: "deploy"\n---\nbody');
    expect(fields[0].value).toBe("deploy");
  });

  it("leaves nested YAML out of the chip table rather than flattening it", () => {
    const { fields } = splitFrontmatter(
      "---\nname: deploy\nmetadata:\n  owner: platform\n---\nbody",
    );
    expect(fields.map((f) => f.key)).toEqual(["name", "metadata"]);
    expect(fields[1].value).toBe("");
  });

  it("passes a file with no frontmatter through untouched", () => {
    const content = "# Just a heading\n\nBody.";
    const { fields, body } = splitFrontmatter(content);
    expect(fields).toEqual([]);
    expect(body).toBe(content);
  });

  it("does not treat a mid-file rule as frontmatter", () => {
    const content = "# Heading\n\n---\n\nnot: frontmatter\n";
    expect(splitFrontmatter(content).fields).toEqual([]);
  });
});

describe("totalBytes", () => {
  it("sums every item", () => {
    expect(totalBytes([cap({ bytes: 100 }), cap({ bytes: 250 })])).toBe(350);
    expect(totalBytes([])).toBe(0);
  });
});

describe("shortPath", () => {
  it("collapses a home prefix to a tilde", () => {
    expect(shortPath("/Users/ada/.claude/skills/x/SKILL.md")).toBe(
      "~/.claude/skills/x/SKILL.md",
    );
    expect(shortPath("/home/ada/.codex/config.toml")).toBe("~/.codex/config.toml");
  });

  it("leaves a path outside home alone", () => {
    expect(shortPath("/repo/proj/.mcp.json")).toBe("/repo/proj/.mcp.json");
  });
});

// The estimate is the pane's headline number. Getting it visibly wrong — by
// counting a config blob or a whole SKILL.md as context — would discredit
// everything else on screen, so each kind is pinned down here.
describe("upfrontBytes", () => {
  it("counts an instructions file in full, because it is read every turn", () => {
    expect(upfrontBytes(cap({ kind: "instructions", bytes: 4096 }))).toBe(4096);
  });

  it("counts only name and description for a progressive skill", () => {
    const skill = cap({ kind: "skill", name: "deploy", description: "Ship it", bytes: 40000 });
    expect(upfrontBytes(skill)).toBe("deploy".length + "Ship it".length);
  });

  it("treats subagents the same way, since their description drives delegation", () => {
    const agent = cap({ kind: "subagent", name: "rev", description: "Reviews", bytes: 9000 });
    expect(upfrontBytes(agent)).toBe("rev".length + "Reviews".length);
  });

  // A manual-only skill is kept out of context description and all, whichever
  // CLI is holding it back. Subagents have no such opt-out, so the flag on one
  // means nothing.
  it("counts nothing for a manual-only skill under either CLI", () => {
    expect(upfrontBytes(cap({ manual: true, bytes: 40000 }))).toBe(0);
    expect(upfrontBytes(cap({ manual: true, cli: "codex", bytes: 40000 }))).toBe(0);
    expect(upfrontBytes(cap({ kind: "subagent", manual: true }))).toBe(
      "deploy".length + "Ship it".length,
    );
  });

  it("never counts an MCP config blob — the cost is tool schemas, not the file", () => {
    expect(upfrontBytes(cap({ kind: "mcp", bytes: 5000 }))).toBe(0);
  });

  it("counts nothing for commands, plugins or hooks", () => {
    expect(upfrontBytes(cap({ kind: "command", bytes: 5000 }))).toBe(0);
    expect(upfrontBytes(cap({ kind: "plugin", bytes: 5000 }))).toBe(0);
    expect(upfrontBytes(cap({ kind: "hook", bytes: 5000 }))).toBe(0);
  });

  it("costs nothing when the agent will not load it at all", () => {
    expect(upfrontBytes(cap({ kind: "instructions", bytes: 4096, enabled: false }))).toBe(0);
    expect(upfrontBytes(cap({ kind: "instructions", bytes: 4096, shadowedBy: "/x" }))).toBe(0);
  });
});

// The scan already decided whether the opt-out the CLI honours is there, so
// this side must not second-guess it by CLI — a Codex skill it wrongly reads as
// auto-loading is one the row and the budget both describe wrongly.
describe("manualOnly", () => {
  it("takes the flag as the scan set it, under either CLI", () => {
    expect(manualOnly(cap({ manual: true }))).toBe(true);
    expect(manualOnly(cap({ manual: true, cli: "codex" }))).toBe(true);
    expect(manualOnly(cap({ cli: "codex" }))).toBe(false);
  });

  it("means nothing on anything but a skill", () => {
    expect(manualOnly(cap({ kind: "command", manual: true }))).toBe(false);
  });
});

describe("upfrontTotal and uncountedServers", () => {
  const items = [
    cap({ id: "md", kind: "instructions", bytes: 1000 }),
    cap({ id: "mcp-on", kind: "mcp", bytes: 5000 }),
    cap({ id: "mcp-off", kind: "mcp", bytes: 5000, enabled: false }),
    cap({
      id: "mcp-pending",
      kind: "mcp",
      bytes: 5000,
      problem: "pending approval",
      blocking: true,
    }),
  ];

  it("sums only what can be measured honestly", () => {
    expect(upfrontTotal(items)).toBe(1000);
  });

  it("counts the servers whose schemas load but cannot be measured", () => {
    expect(uncountedServers(items)).toBe(1);
  });
});

// Descriptions are prompt text aimed at the model. In a list they need to be
// readable at a glance, not rendered as literal asterisks and backticks.
describe("shortDescription", () => {
  it("strips markdown that would otherwise show as punctuation", () => {
    expect(shortDescription("**MANDATORY** — call `use_figma` first.")).toBe(
      "MANDATORY — call use_figma first.",
    );
  });

  it("keeps the first sentence and drops the rest", () => {
    const long =
      "Translates Figma motion into code. Use when implementing animation from a Figma design.";
    expect(shortDescription(long)).toBe("Translates Figma motion into code.");
  });

  it("truncates a first sentence that runs long", () => {
    const result = shortDescription(`${"word ".repeat(60)}end.`);
    expect(result.length).toBeLessThanOrEqual(110);
    expect(result.endsWith("…")).toBe(true);
  });

  it("collapses newlines so a row stays one line", () => {
    expect(shortDescription("first\n\nsecond")).toBe("first second");
  });

  // snake_case is everywhere in tool and skill names; underscore-italics are not.
  it("leaves underscores in identifiers alone", () => {
    expect(shortDescription("Calls browser_navigate and node_repl.")).toBe(
      "Calls browser_navigate and node_repl.",
    );
  });

  it("passes an empty description through", () => {
    expect(shortDescription("")).toBe("");
  });
});
