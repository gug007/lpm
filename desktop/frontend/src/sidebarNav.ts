// The sidebar footer's navigation items. Each one lives either in the sidebar
// itself or inside the More menu, and the user moves it between the two.

// Canonical order, used by both places: the sidebar renders the items it holds
// top to bottom, the menu renders the rest. Moving an item out and back leaves
// the footer exactly as it was.
export const NAV_ITEM_IDS = [
  "terminals",
  "activity",
  "automations",
  "usage",
  "stats",
  "mobile",
  "settings",
  "feedback",
] as const;

export type NavItemId = (typeof NAV_ITEM_IDS)[number];

// The items the menu keeps below its divider — the app itself rather than a
// view of your work. They only get a divider while both sides still have rows.
export const NAV_UTILITY_IDS: readonly NavItemId[] = ["settings", "feedback"];

// Terminals is the one row worth a permanent seat: a shell for anything not
// tied to a project is reached often enough that a menu hop is a tax.
export const DEFAULT_SIDEBAR_NAV: readonly NavItemId[] = ["terminals"];

export function isNavItemId(value: unknown): value is NavItemId {
  return (
    typeof value === "string" && (NAV_ITEM_IDS as readonly string[]).includes(value)
  );
}

/** Sanitize a stored list: known ids only, deduped, in canonical order.
 *  `undefined` for anything that isn't a list, which is what keeps "the user
 *  emptied the sidebar" distinguishable from "the user never touched it". */
export function normalizeSidebarNav(raw: unknown): NavItemId[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return NAV_ITEM_IDS.filter((id) => raw.includes(id));
}

/** The list with `id` moved into the sidebar (`inSidebar`) or into the menu. */
export function withSidebarNav(
  current: readonly NavItemId[],
  id: NavItemId,
  inSidebar: boolean,
): NavItemId[] {
  return NAV_ITEM_IDS.filter((item) =>
    item === id ? inSidebar : current.includes(item),
  );
}

/** The items the menu is left holding, in canonical order. */
export function menuNavItems(inSidebar: readonly NavItemId[]): NavItemId[] {
  return NAV_ITEM_IDS.filter((id) => !inSidebar.includes(id));
}

export function isDefaultSidebarNav(current: readonly NavItemId[]): boolean {
  return (
    current.length === DEFAULT_SIDEBAR_NAV.length &&
    DEFAULT_SIDEBAR_NAV.every((id, i) => current[i] === id)
  );
}
