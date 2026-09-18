import type { UtilityTabKind } from "./pane-action-meta";
import { tabKey, type PaneLeaf } from "./pane-tree";

export type UtilityTabAction =
  // Focus the pane's tab of this kind, adding one if it has none.
  | { action: "open"; remember: string | null }
  // Second press: close it and go back where the first press came from.
  | { action: "close"; tabIdx: number; back: string | null };

function pressedFrom(leaf: PaneLeaf, tabKind: UtilityTabKind): string | null {
  const tab = leaf.tabs[leaf.activeTabIdx];
  if (!tab || tab.kind === tabKind) return null;
  return tabKey(tab);
}

// The remembered tab is only worth returning to if it is still open and is not
// the one being closed.
function stillReachable(
  leaf: PaneLeaf,
  remembered: string | null,
  tabIdx: number,
): string | null {
  if (!remembered) return null;
  const idx = leaf.tabs.findIndex((tab) => tabKey(tab) === remembered);
  return idx >= 0 && idx !== tabIdx ? remembered : null;
}

// Mirrors the app's resolveUtilityTabAction: a toolbar button both shows its
// tab and dismisses it, and dismissing returns to what the visitor was reading
// rather than to whichever tab happens to neighbour the closed one.
export function resolveUtilityTabAction(
  leaf: PaneLeaf,
  tabKind: UtilityTabKind,
  remembered: string | null,
): UtilityTabAction {
  const tabIdx = leaf.tabs.findIndex((tab) => tab.kind === tabKind);
  const showing = tabIdx >= 0 && leaf.activeTabIdx === tabIdx;
  if (!showing) return { action: "open", remember: pressedFrom(leaf, tabKind) };
  return { action: "close", tabIdx, back: stillReachable(leaf, remembered, tabIdx) };
}
