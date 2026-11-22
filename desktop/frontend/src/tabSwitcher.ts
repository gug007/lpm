import type { TabVisit } from "./store/tabHistory";
import type { TerminalTargetInfo } from "./store/terminalTargets";
import { GLOBAL_TERMINALS_KEY } from "./terminals";

// Ctrl+Tab's list: the tabs the user has been on, most recent first, that can
// still be reached. A project on a computer that isn't connected is skipped; a
// project that isn't open yet keeps its tabs, which come back as it opens; an
// open project's closed tab is gone.
export function buildTabSwitchList(
  visits: TabVisit[],
  projectNames: Set<string>,
  targets: Record<string, TerminalTargetInfo[]>,
): TabVisit[] {
  return visits
    .filter((v) => v.project === GLOBAL_TERMINALS_KEY || projectNames.has(v.project))
    .map((v) => {
      const open = targets[v.project];
      if (!open) return v;
      const tab = open.find((t) => t.historyKey === v.key);
      return tab ? { ...v, label: tab.label || v.label } : null;
    })
    .filter((v): v is TabVisit => v !== null);
}

// Where the first press lands. From the tab on screen (the list's first row)
// it goes back one; from anywhere else (Settings, a service log) it goes to
// the last tab. Shift walks from the oldest end.
export function firstIndex(len: number, onFirst: boolean, dir: 1 | -1): number {
  if (dir === -1) return len - 1;
  return onFirst ? Math.min(1, len - 1) : 0;
}

export function cycleIndex(len: number, index: number, dir: 1 | -1): number {
  if (len <= 0) return 0;
  return (((index + dir) % len) + len) % len;
}
