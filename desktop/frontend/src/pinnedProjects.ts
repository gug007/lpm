/** The pins that have a project to show, in the order they were pinned. A pin
 *  whose project is gone (removed, or on a Mac that is away) keeps its place
 *  and shows again when the project does. */
export function shownPins(pins: readonly string[] | undefined, names: ReadonlySet<string>): string[] {
  return (pins ?? []).filter((name, i, all) => names.has(name) && all.indexOf(name) === i);
}

/** `pins` with `name` pinned at the end, or unpinned. Undefined once nothing
 *  is pinned, so the setting drops out of the file. */
export function withPin(
  pins: readonly string[] | undefined,
  name: string,
  pinned: boolean,
): string[] | undefined {
  const rest = (pins ?? []).filter((n) => n !== name);
  const next = pinned ? [...rest, name] : rest;
  return next.length > 0 ? next : undefined;
}

/** The pins after the shown ones were dragged into `order`; pins with nothing
 *  to show keep their places at the end. */
export function reorderPins(pins: readonly string[] | undefined, order: readonly string[]): string[] {
  const moved = new Set(order);
  return [...order, ...(pins ?? []).filter((name) => !moved.has(name))];
}

/** What ⌘1–⌘9 reach: the pinned projects first, then the rest in sidebar
 *  order. */
export function jumpTargets(pinned: readonly string[], names: readonly string[]): string[] {
  const first = new Set(pinned);
  return [...pinned, ...names.filter((name) => !first.has(name))];
}
