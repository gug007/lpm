// Side by side shows several projects in one window, one column each. Past six
// the columns get too narrow for an agent's output to be readable.
export const MAX_SIDE_BY_SIDE = 6;

// The columns to draw: the set, minus projects that no longer exist, and only
// while the project the user is in is one of them — navigating anywhere else
// shows that project alone.
export function sideBySideColumns(
  names: readonly string[],
  selected: string | null,
  existing: ReadonlySet<string>,
): string[] {
  const live = names.filter((n) => existing.has(n));
  return live.length >= 2 && selected !== null && live.includes(selected) ? live : [];
}

// Adds `name` next to the set `anchor` belongs to, or starts a new set from
// `anchor` when it isn't in the current one.
export function addColumn(
  names: readonly string[],
  anchor: string | null,
  name: string,
): string[] {
  const base = anchor === null || names.includes(anchor) ? [...names] : [anchor];
  if (base.includes(name) || base.length >= MAX_SIDE_BY_SIDE) return base;
  return [...base, name];
}

// A single column left is no longer side by side.
export function removeColumn(names: readonly string[], name: string): string[] {
  const next = names.filter((n) => n !== name);
  return next.length < 2 ? [] : next;
}

// Up to three across; four or more wrap into two rows.
export function gridShape(count: number): { cols: number; rows: number } {
  if (count <= 3) return { cols: Math.max(count, 1), rows: 1 };
  return { cols: Math.ceil(count / 2), rows: 2 };
}

const PASSIVE_COLUMN = '[data-project-column="passive"]';

// Every column is on screen, but only the one the user is working in may take
// keyboard focus on its own (a new terminal, a re-shown composer).
export function inPassiveColumn(el: Element | null): boolean {
  return Boolean(el?.closest(PASSIVE_COLUMN));
}
