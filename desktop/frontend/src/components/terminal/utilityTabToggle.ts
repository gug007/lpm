import { ALL_SERVICES, type PaneLeaf, type TerminalInstance } from "../../paneTree";

// Tabs that ⌘⇧M / ⌘⇧K / ⌘⇧E toggle on and off in the focused pane.
export type UtilityTabKind = "memory" | "toolkit" | "files";

// The header entry the toggle was pressed from — a terminal tab, or the service
// log the pane was showing.
export type UtilityReturn =
  | { kind: "tab"; id: string }
  | { kind: "service"; name: string };

export type UtilityTabAction =
  | { action: "open"; remember: UtilityReturn | null }
  | { action: "close"; tabIdx: number; back: UtilityReturn | null };

// A press that only switches the tab's view keeps the return the tab was
// opened with.
function pressedFrom(
  pane: PaneLeaf,
  tabKind: UtilityTabKind,
  remembered: UtilityReturn | null,
): UtilityReturn | null {
  if (pane.activeServiceName) return { kind: "service", name: pane.activeServiceName };
  const tab = pane.tabs[pane.activeTabIdx];
  if (!tab) return null;
  if (tab.kind === tabKind) return remembered;
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
// the closed tab's neighbour — rarely the tab the user was reading. A tab with
// several views (Files vs Changes) counts as showing only on the view the press
// asks for, so the press switches views before it ever closes.
export function resolveUtilityTabAction(
  pane: PaneLeaf,
  tabKind: UtilityTabKind,
  remembered: UtilityReturn | null,
  serviceNames: string[],
  showsView: (tab: TerminalInstance) => boolean = () => true,
): UtilityTabAction {
  const tabIdx = pane.tabs.findIndex((t) => t.kind === tabKind);
  const showing =
    tabIdx >= 0 &&
    !pane.activeServiceName &&
    pane.activeTabIdx === tabIdx &&
    showsView(pane.tabs[tabIdx]);
  if (!showing) return { action: "open", remember: pressedFrom(pane, tabKind, remembered) };
  return { action: "close", tabIdx, back: stillReachable(pane, remembered, serviceNames, tabIdx) };
}
