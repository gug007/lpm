import {
  collectTerminals,
  terminalDisplayLabel,
  type PaneNode,
} from "./paneTree";

export function disambiguateLabelAgainst(
  base: string,
  usedLabels: Iterable<string>,
): string {
  const used = new Set(usedLabels);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

// The smallest "Terminal N" not already used, so labels don't collide after
// terminals are closed and re-created in different order.
export function nextTerminalLabel(used: ReadonlySet<string>): string {
  let n = 1;
  while (used.has(`Terminal ${n}`)) n++;
  return `Terminal ${n}`;
}

export function pickTerminalLabel(node: PaneNode | null): string {
  return nextTerminalLabel(new Set(node ? collectTerminals(node).map(terminalDisplayLabel) : []));
}

// Terminals launched from the same action share the action's label. When one is
// already open, suffix the new tab so the strip never shows two identical names:
// "Ultracode", "Ultracode 2", "Ultracode 3". The first instance keeps the bare
// label; a gap left by a closed tab is refilled (smallest free suffix wins).
export function disambiguateLabel(node: PaneNode | null, base: string): string {
  return disambiguateLabelAgainst(
    base,
    node ? collectTerminals(node).map(terminalDisplayLabel) : [],
  );
}
