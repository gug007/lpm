import { ALL_SERVICES, type PaneLeaf } from "../../paneTree";

// Tabs that ⌘⇧R / ⌘⇧M toggle on and off in the focused pane.
export type UtilityTabKind = "review" | "memory";

// The header entry the toggle was pressed from — a terminal tab, or the service
// log the pane was showing.
export type UtilityReturn =
  | { kind: "tab"; id: string }
  | { kind: "service"; name: string };

export type UtilityTabAction =
  | { action: "open"; remember: UtilityReturn | null }
  | { action: "close"; tabIdx: number; back: UtilityReturn | null };

function pressedFrom(pane: PaneLeaf, tabKind: UtilityTabKind): UtilityReturn | null {
  if (pane.activeServiceName) return { kind: "service", name: pane.activeServiceName };
  const tab = pane.tabs[pane.activeTabIdx];
  if (!tab || tab.kind === tabKind) return null;
  return { kind: "tab", id: tab.id };
}

function stillReachable(
  pane: PaneLeaf,
  remembered: UtilityReturn | null,
  serviceNames: string[],
  tabIdx: number,
): UtilityReturn | null {
  if (!remembered) return null;
  if (remembered.kind === "service") {
    const exists =
      serviceNames.includes(remembered.name) ||
      (remembered.name === ALL_SERVICES && serviceNames.length > 1);
    return exists ? remembered : null;
  }
  const idx = pane.tabs.findIndex((t) => t.id === remembered.id);
  return idx >= 0 && idx !== tabIdx ? remembered : null;
}

// Second press closes the utility tab and returns to where the first press came
// from; without `back`, closing falls to resolveActiveAfterClose, which picks
// the closed tab's neighbour — rarely the tab the user was reading.
export function resolveUtilityTabAction(
  pane: PaneLeaf,
  tabKind: UtilityTabKind,
  remembered: UtilityReturn | null,
  serviceNames: string[],
): UtilityTabAction {
  const tabIdx = pane.tabs.findIndex((t) => t.kind === tabKind);
  const showing = tabIdx >= 0 && !pane.activeServiceName && pane.activeTabIdx === tabIdx;
  if (!showing) return { action: "open", remember: pressedFrom(pane, tabKind) };
  return { action: "close", tabIdx, back: stillReachable(pane, remembered, serviceNames, tabIdx) };
}
