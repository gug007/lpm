// The context budget as a ledger: which named thing puts how much into the
// window before the user types, laid out to scale. Kept pure so the bar, the
// axis and the caption are all read off one computation.

import type { AgentCapability, CapabilityKind } from "./toolkit";
import {
  costsContext,
  estimateTokens,
  scopeLabel,
  shortPath,
  uncountedServers,
  upfrontBytes,
} from "./toolkit";

export interface BudgetSegment {
  id: string;
  kind: CapabilityKind;
  label: string;
  title: string;
  bytes: number;
}

export interface BudgetLedger {
  segments: BudgetSegment[];
  byKind: { kind: CapabilityKind; bytes: number }[];
  bytes: number;
  servers: number;
  files: number;
  skills: number;
  subagents: number;
  // Enabled and loading, but deliberately outside the bar: named in one line so
  // the estimate cannot be read as "everything installed".
  excluded: { commands: number; hooks: number; shadowed: number; disabled: number };
}

// Instructions are read in full, so each file is its own block — the whole
// point is to see that one of them is most of the budget. Skills and subagents
// contribute a name and a description each, which is a column of near-identical
// slivers, so they aggregate into one block per kind.
const MEASURED: CapabilityKind[] = ["instructions", "skill", "subagent"];

export function buildLedger(items: AgentCapability[]): BudgetLedger {
  const paying = items.filter((item) => upfrontBytes(item) > 0);
  const instructions = paying
    .filter((item) => item.kind === "instructions")
    .sort((a, b) => b.bytes - a.bytes);

  const segments: BudgetSegment[] = [];
  for (const item of instructions) {
    // Two CLAUDE.md files, one personal and one in the repo, are a normal
    // setup: the basename alone would label both blocks the same.
    const twin = instructions.some((other) => other !== item && other.name === item.name);
    segments.push({
      id: item.id,
      kind: "instructions",
      label: twin ? `${item.name} · ${scopeLabel(item.scope)}` : item.name,
      title: shortPath(item.path),
      bytes: upfrontBytes(item),
    });
  }

  for (const kind of ["skill", "subagent"] as const) {
    const group = paying.filter((item) => item.kind === kind);
    if (group.length === 0) continue;
    const bytes = group.reduce((sum, item) => sum + upfrontBytes(item), 0);
    const noun = kind === "skill" ? "skill" : "subagent";
    segments.push({
      id: `kind:${kind}`,
      kind,
      label: `${group.length} ${noun} description${group.length === 1 ? "" : "s"}`,
      title: `Only the name and description of each ${noun} is loaded up front; the body arrives when the agent opens it.`,
      bytes,
    });
  }

  const bytes = segments.reduce((sum, segment) => sum + segment.bytes, 0);

  const counted = (kind: CapabilityKind) =>
    items.filter((item) => item.kind === kind && costsContext(item)).length;

  return {
    segments,
    byKind: MEASURED.map((kind) => ({
      kind,
      bytes: segments
        .filter((segment) => segment.kind === kind)
        .reduce((sum, segment) => sum + segment.bytes, 0),
    })).filter((group) => group.bytes > 0),
    bytes,
    servers: uncountedServers(items),
    files: instructions.length,
    skills: paying.filter((item) => item.kind === "skill").length,
    subagents: paying.filter((item) => item.kind === "subagent").length,
    excluded: {
      commands: counted("command"),
      hooks: counted("hook"),
      shadowed: items.filter((item) => item.enabled && item.shadowedBy).length,
      disabled: items.filter((item) => !item.enabled).length,
    },
  };
}

export function hasBudget(ledger: BudgetLedger): boolean {
  return ledger.bytes > 0 || ledger.servers > 0;
}

const STEPS = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000];

// Ticks the eye can do arithmetic with — round numbers up to the total, then
// the total itself, which is rarely round.
export function axisTicks(bytes: number): { tokens: number; at: number }[] {
  const total = estimateTokens(bytes);
  if (total <= 0) return [];
  const step = STEPS.find((candidate) => total / candidate <= 4) ?? STEPS[STEPS.length - 1];
  const ticks: { tokens: number; at: number }[] = [];
  for (let value = 0; value < total; value += step) {
    // A round tick sitting under the total's label reads as clutter.
    if (value > 0 && (total - value) / total < 0.12) continue;
    ticks.push({ tokens: value, at: value / total });
  }
  ticks.push({ tokens: total, at: 1 });
  return ticks;
}

export function excludedSummary(ledger: BudgetLedger): string {
  const { commands, hooks, shadowed, disabled } = ledger.excluded;
  const parts = ["skill and subagent bodies, read only when used"];
  if (commands > 0) parts.push(`${commands} command${commands === 1 ? "" : "s"}, loaded on invocation`);
  if (hooks > 0) parts.push(`${hooks} hook${hooks === 1 ? "" : "s"}`);
  if (shadowed > 0) parts.push(`${shadowed} shadowed cop${shadowed === 1 ? "y" : "ies"}`);
  if (disabled > 0) parts.push(`${disabled} switched off`);
  return parts.join(" · ");
}
