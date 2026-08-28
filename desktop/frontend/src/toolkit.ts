// Types and shared vocabulary for the Toolkit tab: what an agent CLI will
// actually load in a directory, and why a capability that looks installed may
// not be.

export type CapabilityKind =
  | "mcp"
  | "skill"
  | "plugin"
  | "subagent"
  | "command"
  | "instructions"
  | "hook";

export type CapabilityScope = "user" | "project" | "local" | "plugin";

export interface AgentCapability {
  id: string;
  kind: CapabilityKind;
  name: string;
  cli: string;
  scope: CapabilityScope;
  path: string;
  description: string;
  detail: string;
  enabled: boolean;
  editable: boolean;
  shadowedBy: string;
  problem: string;
  // Whether `problem` actually stops it loading. A secret warning and an
  // ambiguous tie do not.
  blocking: boolean;
  bytes: number;
}

export interface CapabilityRoot {
  cli: string;
  scope: string;
  // Which kind of capability this directory holds, so the pane can offer to add
  // one. Empty for the MCP config files and instructions files.
  kind: string;
  path: string;
  exists: boolean;
}

export interface AgentCapabilities {
  items: AgentCapability[];
  roots: CapabilityRoot[];
  remote: boolean;
  truncated: boolean;
  trusted: boolean;
}

export interface CapabilityDoc {
  path: string;
  content: string;
  editable: boolean;
  truncated: boolean;
}

export const KIND_ORDER: CapabilityKind[] = [
  "mcp",
  "skill",
  "plugin",
  "subagent",
  "command",
  "instructions",
  "hook",
];

export const KIND_LABELS: Record<CapabilityKind, string> = {
  mcp: "MCP servers",
  skill: "Skills",
  plugin: "Plugins",
  subagent: "Subagents",
  command: "Commands",
  instructions: "Instructions",
  hook: "Hooks",
};

// Stated in one plain sentence next to any shadowed capability. Skills and
// subagents resolve in opposite directions — that surprise is the reason the
// rule is spelled out rather than implied by an icon.
export const SHADOW_RULE: Partial<Record<CapabilityKind, string>> = {
  skill: "For skills, your personal copy in ~/.claude beats the project's.",
  subagent: "For subagents, the project copy beats your personal one.",
  command: "For commands, the project copy beats your personal one.",
  mcp: "For MCP servers, local scope beats project, and project beats user.",
};

export const CLI_LABELS: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex",
};

// Absolute paths are long and mostly prefix. Home shortens to "~" the way every
// terminal in the app already shows it.
export function shortPath(path: string, home = ""): string {
  const h = home || guessHome(path);
  return h && path.startsWith(h) ? `~${path.slice(h.length)}` : path;
}

function guessHome(path: string): string {
  const match = /^\/(?:Users|home)\/[^/]+/.exec(path);
  return match ? match[0] : "";
}

// Rough and labelled as such everywhere it appears: a visibly wrong precise
// number would discredit the whole pane.
export function estimateTokens(bytes: number): number {
  return Math.round(bytes / 4);
}

export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  return `${(tokens / 1000).toFixed(1)}k`;
}

export function formatTokens(bytes: number): string {
  return formatTokenCount(estimateTokens(bytes));
}

// Installed, wins its name, and has nothing wrong with it.
export function loads(cap: AgentCapability): boolean {
  return cap.enabled && !cap.shadowedBy && !cap.problem;
}

// Disabled is a choice the user already made, so it is listed apart rather than
// flagged as a fault: this is "you did not turn it off, and it still is not
// doing what you expect".
export function needsAttention(cap: AgentCapability): boolean {
  return cap.enabled && !loads(cap);
}

// Whether it still occupies the context window, which is a different question
// from whether anything is wrong with it. Only `blocking` problems stop a
// capability loading: a server with a literal API key starts anyway, and an
// ambiguous tie flags every candidate even though one of them wins — zeroing
// those would under-report the very number the pane exists to give.
export function costsContext(cap: AgentCapability): boolean {
  return cap.enabled && !cap.shadowedBy && !(cap.problem && cap.blocking);
}

// Descriptions are written for the model, not for a list: they open with
// "**MANDATORY prerequisite** — you MUST…" and run for paragraphs. Take the
// first sentence, drop the markdown that would otherwise render as literal
// asterisks, and let the row's title attribute carry the rest.
export function shortDescription(text: string): string {
  const plain = text
    // `*` and backticks only: underscores are snake_case in tool and skill
    // names far more often than they are markdown emphasis.
    .replace(/[*`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const sentence = /^(.{20,}?[.!?])(\s|$)/.exec(plain);
  const first = sentence ? sentence[1] : plain;
  return first.length > 110 ? `${first.slice(0, 109).trimEnd()}…` : first;
}

// The one-line reason a capability will not do what the user expects, or null
// when it is fine. Shadowing carries its rule so the answer is self-contained.
export function capabilityIssue(cap: AgentCapability): string | null {
  if (cap.shadowedBy) {
    const rule = SHADOW_RULE[cap.kind] ?? "";
    return `Shadowed by ${shortPath(cap.shadowedBy)}. ${rule}`.trim();
  }
  if (cap.problem) return cap.problem;
  return null;
}

export function scopeLabel(scope: CapabilityScope): string {
  if (scope === "local") return "local";
  if (scope === "plugin") return "plugin";
  return scope;
}

export function groupByKind(
  items: AgentCapability[],
): { kind: CapabilityKind; items: AgentCapability[]; bytes: number }[] {
  return KIND_ORDER.map((kind) => {
    const group = items.filter((i) => i.kind === kind);
    return { kind, items: group, bytes: group.reduce((sum, i) => sum + i.bytes, 0) };
  }).filter((g) => g.items.length > 0);
}

export function totalBytes(items: AgentCapability[]): number {
  return items.reduce((sum, i) => sum + i.bytes, 0);
}

// What a capability actually puts into the context window before the user types
// anything — which is not its file size:
//   - instructions files are read in full, every turn;
//   - skills and subagents are progressive, so only the name and description are
//     loaded up front and the body arrives only if the agent opens it;
//   - commands load on invocation, not up front;
//   - MCP tool schemas *do* load up front, but measuring them means connecting
//     to the server, so they are reported as uncounted rather than guessed at.
export function upfrontBytes(cap: AgentCapability): number {
  if (!costsContext(cap)) return 0;
  if (cap.kind === "instructions") return cap.bytes;
  if (cap.kind === "skill" || cap.kind === "subagent") {
    return cap.name.length + cap.description.length;
  }
  return 0;
}

export function upfrontTotal(items: AgentCapability[]): number {
  return items.reduce((sum, i) => sum + upfrontBytes(i), 0);
}

// MCP servers that load, whose tool schemas are the usual dominant cost — the
// number the estimate above deliberately excludes. Same predicate as the bytes,
// so the headline and its caveat describe one set.
export function uncountedServers(items: AgentCapability[]): number {
  return items.filter((i) => i.kind === "mcp" && costsContext(i)).length;
}

// Frontmatter as the detail view shows it: a chip table above the prose, with
// the raw block removed from the body so it is not rendered twice.
export function splitFrontmatter(content: string): {
  fields: { key: string; value: string }[];
  body: string;
} {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!match) return { fields: [], body: content };
  const fields: { key: string; value: string }[] = [];
  for (const line of match[1].split(/\r?\n/)) {
    // Only top-level `key: value` pairs become chips; nested YAML stays in the
    // Source tab rather than being flattened into something misleading.
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const value = pair[2].trim().replace(/^["']|["']$/g, "");
    fields.push({ key: pair[1], value });
  }
  return { fields, body: content.slice(match[0].length) };
}
