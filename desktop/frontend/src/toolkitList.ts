// The list's row model, kept pure so the flat index the keyboard walks and the
// sections the eye reads can never drift apart.

import type { AgentCapability, CapabilityKind } from "./toolkit";
import { KIND_ORDER, loads, needsAttention, upfrontTotal } from "./toolkit";

export type ListNode =
  | {
      type: "section";
      id: string;
      label: string;
      count: number;
      bytes: number;
      kind?: CapabilityKind;
      tone?: "warn";
    }
  | { type: "group"; id: string; label: string; count: number; bytes: number; open: boolean }
  | { type: "item"; cap: AgentCapability; index: number; nested: boolean };

// Plugin-provided capabilities are namespaced, never editable, and arrive in
// blocks — one plugin can ship a dozen skills. They collapse under the plugin
// so a single vendor cannot bury everything the user actually installed.
export function groupKey(cap: AgentCapability): string | null {
  return cap.scope === "plugin" && cap.detail ? cap.detail : null;
}

function sectionBytes(items: AgentCapability[]): number {
  return upfrontTotal(items);
}

// Groups start folded — `expanded` names the ones the user opened. A dozen
// skills from one vendor should not push the user's own work off screen.
export function buildList(
  items: AgentCapability[],
  expanded: ReadonlySet<string>,
): ListNode[] {
  const nodes: ListNode[] = [];
  let index = 0;
  const pushItem = (cap: AgentCapability, nested: boolean) => {
    nodes.push({ type: "item", cap, index, nested });
    index += 1;
  };

  // Disabled is a choice, not a fault: it belongs at the end, not under a
  // warning header. Only things the user did not switch off demand attention.
  const attention = items.filter(needsAttention);
  const inactive = items.filter((i) => !i.enabled);
  const healthy = items.filter(loads);

  if (attention.length > 0) {
    nodes.push({
      type: "section",
      id: "attention",
      label: "Needs attention",
      count: attention.length,
      bytes: 0,
      tone: "warn",
    });
    attention.forEach((cap) => pushItem(cap, false));
  }

  for (const kind of KIND_ORDER) {
    const group = healthy.filter((i) => i.kind === kind);
    if (group.length === 0) continue;
    nodes.push({
      type: "section",
      id: `kind:${kind}`,
      label: KIND_SECTION_LABELS[kind],
      count: group.length,
      bytes: sectionBytes(group),
      kind,
    });

    const own = group.filter((i) => groupKey(i) === null);
    own.forEach((cap) => pushItem(cap, false));

    const byPlugin = new Map<string, AgentCapability[]>();
    for (const cap of group) {
      const key = groupKey(cap);
      if (!key) continue;
      const bucket = byPlugin.get(key);
      if (bucket) bucket.push(cap);
      else byPlugin.set(key, [cap]);
    }
    for (const [key, members] of byPlugin) {
      const id = `${kind}:${key}`;
      const open = expanded.has(id);
      nodes.push({
        type: "group",
        id,
        label: key,
        count: members.length,
        bytes: sectionBytes(members),
        open,
      });
      if (open) members.forEach((cap) => pushItem(cap, true));
    }
  }

  if (inactive.length > 0) {
    const open = expanded.has(INACTIVE_GROUP);
    nodes.push({
      type: "group",
      id: INACTIVE_GROUP,
      label: "Disabled",
      count: inactive.length,
      bytes: 0,
      open,
    });
    if (open) inactive.forEach((cap) => pushItem(cap, true));
  }

  return nodes;
}

export function visibleItems(nodes: ListNode[]): AgentCapability[] {
  return nodes.flatMap((n) => (n.type === "item" ? [n.cap] : []));
}

// The pile of things the user switched off. It follows the last kind rather
// than opening a section of its own, so the panel layer has to know where to
// cut instead of inferring it from a label.
export const INACTIVE_GROUP = "inactive";

export interface ListPanel {
  id: string;
  label: string;
  count: number;
  bytes: number;
  kind: CapabilityKind | null;
  tone: "warn" | "plain" | "off";
  // The disabled pile is a group that owns its panel, so the panel's own
  // heading is what folds it.
  toggle: string | null;
  open: boolean;
  nodes: Exclude<ListNode, { type: "section" }>[];
}

// Sections and the trailing disabled group each become a panel; everything
// after a heading belongs to it. Kept next to `buildList` so the flat index the
// keyboard walks and the panels the eye reads still come from one pass.
export function toPanels(nodes: ListNode[]): ListPanel[] {
  const panels: ListPanel[] = [];
  for (const node of nodes) {
    if (node.type === "section") {
      panels.push({
        id: node.id,
        label: node.label,
        count: node.count,
        bytes: node.bytes,
        kind: node.kind ?? null,
        tone: node.tone === "warn" ? "warn" : "plain",
        toggle: null,
        open: true,
        nodes: [],
      });
      continue;
    }
    if (node.type === "group" && node.id === INACTIVE_GROUP) {
      panels.push({
        id: node.id,
        label: node.label,
        count: node.count,
        bytes: 0,
        kind: null,
        tone: "off",
        toggle: node.id,
        open: node.open,
        nodes: [],
      });
      continue;
    }
    panels[panels.length - 1]?.nodes.push(node);
  }
  return panels;
}

const KIND_SECTION_LABELS: Record<CapabilityKind, string> = {
  mcp: "MCP servers",
  skill: "Skills",
  plugin: "Plugins",
  subagent: "Subagents",
  command: "Commands",
  instructions: "Instructions",
  hook: "Hooks",
};
