// The pane header's non-terminal actions. Each one lives either on the
// toolbar, as a button of its own, or inside the "more" menu, and the user
// moves it between the two from either place.

// Canonical order, used by both places, so moving an item out and back leaves
// the header exactly as it was.
export const PANE_ACTION_IDS = ["review", "files", "toolkit", "browser", "resume"] as const;

export type PaneActionId = (typeof PANE_ACTION_IDS)[number];

// Files is the one worth a permanent seat: the project's files are reached
// often enough that a menu hop is a tax.
export const DEFAULT_PANE_TOOLBAR: readonly PaneActionId[] = ["files"];

export function isPaneActionId(value: unknown): value is PaneActionId {
  return typeof value === "string" && (PANE_ACTION_IDS as readonly string[]).includes(value);
}

/** Sanitize a stored list: known ids only, deduped, in canonical order.
 *  `undefined` for anything that isn't a list, so an emptied toolbar stays
 *  distinct from one that was never touched. */
export function normalizePaneToolbar(raw: unknown): PaneActionId[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return PANE_ACTION_IDS.filter((id) => raw.includes(id));
}

/** The list with `id` moved onto the toolbar or back into the menu. */
export function withPaneToolbar(
  current: readonly PaneActionId[],
  id: PaneActionId,
  onToolbar: boolean,
): PaneActionId[] {
  return PANE_ACTION_IDS.filter((item) => (item === id ? onToolbar : current.includes(item)));
}

/** The items the menu is left holding, in canonical order. */
export function paneMenuActions(onToolbar: readonly PaneActionId[]): PaneActionId[] {
  return PANE_ACTION_IDS.filter((id) => !onToolbar.includes(id));
}

export function isDefaultPaneToolbar(current: readonly PaneActionId[]): boolean {
  return (
    current.length === DEFAULT_PANE_TOOLBAR.length &&
    DEFAULT_PANE_TOOLBAR.every((id, i) => current[i] === id)
  );
}
