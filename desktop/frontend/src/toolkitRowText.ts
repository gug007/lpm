// What the list says next to a name. The backend supplies prose only where a
// file actually carries some; everything else is counted from the assembled
// list, which is the only place that knows what a plugin shipped.

import type { AgentCapability, CapabilityKind } from "./toolkit";
import { formatTokens, manualOnly, scopeLabel, shortDescription, upfrontBytes } from "./toolkit";

const CONTRIBUTION_LABELS: Partial<Record<CapabilityKind, [string, string]>> = {
  skill: ["skill", "skills"],
  mcp: ["MCP server", "MCP servers"],
  command: ["command", "commands"],
  subagent: ["subagent", "subagents"],
  hook: ["hook", "hooks"],
};

const CONTRIBUTION_ORDER: CapabilityKind[] = ["skill", "mcp", "command", "subagent", "hook"];

// Plugin-shipped capabilities carry their plugin's full name in `detail`, set
// by the scanner at every site that produces one.
export function pluginContribution(
  plugin: AgentCapability,
  all: AgentCapability[],
): string {
  const counts = new Map<CapabilityKind, number>();
  for (const item of all) {
    if (item.kind === "plugin" || item.detail !== plugin.name) continue;
    counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  }

  const parts: string[] = [];
  for (const kind of CONTRIBUTION_ORDER) {
    const count = counts.get(kind);
    const label = CONTRIBUTION_LABELS[kind];
    if (!count || !label) continue;
    parts.push(`${count} ${count === 1 ? label[0] : label[1]}`);
  }
  return parts.join(", ");
}

export function rowSummary(cap: AgentCapability, all: AgentCapability[]): string {
  if (cap.kind === "plugin") return pluginContribution(cap, all);
  return shortDescription(cap.description);
}

// One word for why a row is not doing what the repo implies. Disabled is a
// choice rather than a fault, so it gets the plainest word of the four.
export function faultState(cap: AgentCapability): string {
  if (!cap.enabled) return "off";
  if (cap.shadowedBy) return "shadowed";
  if (cap.problem) return cap.blocking ? "blocked" : "loads anyway";
  return "";
}

// The right-hand column: only facts that change what happens. A "user" tag on
// forty rows is decoration, and a token figure is only interesting where the
// numbers actually differ from each other.
export function rowMeta(cap: AgentCapability, showCli = false): string {
  const parts: string[] = [];
  if (cap.scope === "plugin" && cap.detail) parts.push(`${cap.detail} plugin`);
  else if (cap.scope !== "user") parts.push(scopeLabel(cap.scope));
  // The one skill state the estimate cannot explain by itself: it costs
  // nothing because only the user can run it.
  if (manualOnly(cap)) parts.push("manual");
  // Claude Code is what the pane reads as by default, so tagging every one of
  // its forty rows says nothing. Only the other CLI's rows earn the word.
  if (showCli && cap.cli !== "claude") parts.push(cap.cli);
  const upfront = upfrontBytes(cap);
  if (cap.kind === "instructions" && upfront > 0) parts.push(`~${formatTokens(upfront)} est`);
  return parts.join(" · ");
}

const KIND_CAVEATS: Partial<Record<CapabilityKind, string>> = {
  mcp: "schemas not counted",
  command: "loaded only when you run one",
  hook: "no up-front context cost",
  instructions: "read in full, every turn",
  plugin: "counted under the kinds they ship",
};

// The line beside a panel's name: how many, what they cost, and how many of
// this kind are sitting in the faults panel instead of below.
export function panelMeta(
  kind: CapabilityKind | null,
  count: number,
  bytes: number,
  flagged: number,
): string {
  const parts = [`${count}`];
  if (flagged > 0) parts.push(`${flagged} flagged above`);
  if (bytes > 0) parts.push(`~${formatTokens(bytes)} est up front`);
  const caveat = kind ? KIND_CAVEATS[kind] : null;
  if (caveat && bytes === 0) parts.push(caveat);
  else if (caveat && kind === "instructions") parts.push("read in full, every turn");
  return parts.join(" · ");
}
