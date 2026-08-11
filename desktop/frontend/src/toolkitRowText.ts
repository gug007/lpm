// What a row's secondary column says. The backend supplies prose only where a
// file actually carries some; everything else is counted from the assembled
// list, which is the only place that knows what a plugin shipped.

import type { AgentCapability, CapabilityKind } from "./toolkit";
import { shortDescription } from "./toolkit";

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
