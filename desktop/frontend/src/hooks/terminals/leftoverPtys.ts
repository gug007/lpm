import { StopTerminal } from "../../../bridge/commands";
import { type PaneNode, collectTerminals, isTerminalTab } from "../../paneTree";
import { isPeerMarked } from "../../peer/markers";

// A reload of the main window (its web content crashed and was restarted)
// forgets every tab's pty but not the ptys: the app keeps running them, and an
// agent in one keeps reporting under an id no tab has any more. Restore starts
// each tab afresh, so the old ones are stopped first. sessionStorage survives a
// reload and nothing else, which is exactly when there is something to stop.

const key = (projectName: string) => `lpm.livePtys.${projectName}`;

/** The project's own live ptys — not a peer's, which outlive us by design. */
export function rememberLivePtys(projectName: string, tree: PaneNode | null): void {
  const ids = tree
    ? collectTerminals(tree)
        .filter((t) => isTerminalTab(t) && !isPeerMarked(t.id) && !t.peerAdopted)
        .map((t) => t.id)
    : [];
  try {
    if (ids.length > 0) sessionStorage.setItem(key(projectName), JSON.stringify(ids));
    else sessionStorage.removeItem(key(projectName));
  } catch {
    /* storage unavailable: a reload then leaves them, as before */
  }
}

/** Stop the ptys a reload left behind, before restore starts their tabs again. */
export function stopLeftoverPtys(projectName: string): void {
  let ids: unknown;
  try {
    ids = JSON.parse(sessionStorage.getItem(key(projectName)) ?? "[]");
    sessionStorage.removeItem(key(projectName));
  } catch {
    return;
  }
  if (!Array.isArray(ids)) return;
  for (const id of ids) {
    if (typeof id === "string") StopTerminal(id).catch(() => {});
  }
}
