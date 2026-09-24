import { pendingClosesForProject } from "../pendingClose";
import { isPeerName } from "../peer/markers";
import type { ScheduledPrompt } from "../store/sendLater";
import { useTerminalTargets } from "../store/terminalTargets";
import { collectPersistedTabs, getProjectTerminals } from "../terminals";
import { onTerminalsClosed } from "./closeout";

// How long a prompt's terminal must stay gone before it counts as closed, so a
// tab mid-restore or mid-move isn't mistaken for one.
const GONE_CONFIRM_MS = 3_000;

// Terminals can close without passing through a close that reports it (a pane
// closed whole, a tab dropped on restore). A prompt whose project is open but
// whose terminal is in neither its live tabs, its saved tabs nor an undo-able
// close is filed as a draft. Returns when to look again, if a check is pending.
export function createClosedTabReconciler() {
  const goneSince = new Map<string, number>();

  return (items: ScheduledPrompt[], now: number): number => {
    const byProject = useTerminalTargets.getState().byProject;
    let recheck = Infinity;
    const live = new Set(items.map((i) => i.id));
    for (const id of goneSince.keys()) if (!live.has(id)) goneSince.delete(id);
    for (const item of items) {
      const targets = byProject[item.projectName];
      const gone =
        targets !== undefined &&
        !isPeerName(item.projectName) &&
        !targets.some((t) => t.historyKey === item.historyKey) &&
        !collectPersistedTabs(getProjectTerminals(item.projectName).panes).some(
          (t) => t.historyKey === item.historyKey,
        ) &&
        !pendingClosesForProject(item.projectName).some((e) => e.tab.historyKey === item.historyKey);
      if (!gone) {
        goneSince.delete(item.id);
        continue;
      }
      const since = goneSince.get(item.id) ?? now;
      goneSince.set(item.id, since);
      if (now - since >= GONE_CONFIRM_MS) {
        goneSince.delete(item.id);
        onTerminalsClosed(item.projectName, [item.historyKey]);
      } else {
        recheck = Math.min(recheck, since + GONE_CONFIRM_MS);
      }
    }
    return recheck;
  };
}
