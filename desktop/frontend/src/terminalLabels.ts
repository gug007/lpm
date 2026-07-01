import { collectTerminals, type PaneNode } from "./paneTree";

// Picks the smallest positive integer not already used so labels don't
// collide after terminals are closed and re-created in different order.
export function pickTerminalLabel(node: PaneNode | null): string {
  if (!node) return "Terminal 1";
  const used = new Set<number>();
  for (const t of collectTerminals(node)) {
    const match = /^Terminal (\d+)$/.exec(t.label);
    if (match) used.add(parseInt(match[1], 10));
  }
  let n = 1;
  while (used.has(n)) n++;
  return `Terminal ${n}`;
}

// Terminals launched from the same action share the action's label. When one is
// already open, suffix the new tab so the strip never shows two identical names:
// "Ultracode", "Ultracode 2", "Ultracode 3". The first instance keeps the bare
// label; a gap left by a closed tab is refilled (smallest free suffix wins).
export function disambiguateLabel(node: PaneNode | null, base: string): string {
  if (!node) return base;
  const used = new Set(collectTerminals(node).map((t) => t.label));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}
