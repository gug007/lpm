import { useEffect } from "react";
import { IS_MIRROR_WINDOW } from "../../mirror";
import type { TerminalInstance } from "../../paneTree";
import { useAppStore } from "../../store/app";

// Takes in the tabs moved to this project (tabMove.ts) as soon as its tab tree
// is here to hold them.
export function useTakeIns(
  projectName: string,
  takeInTerminal: (tab: TerminalInstance, root: string) => Promise<void>,
): void {
  const waiting = useAppStore((s) => s.pendingTakeIns.some((p) => p.projectName === projectName));
  useEffect(() => {
    if (!waiting || IS_MIRROR_WINDOW) return;
    const { projects, takeTakeIns } = useAppStore.getState();
    const root = projects.find((p) => p.name === projectName)?.root ?? "";
    for (const tab of takeTakeIns(projectName)) void takeInTerminal(tab, root);
  }, [waiting, projectName, takeInTerminal]);
}
