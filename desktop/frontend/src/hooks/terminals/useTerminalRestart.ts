import { useCallback, type RefObject } from "react";
import { toast } from "../../notifications/toast";
import {
  StartTerminal,
  StartTerminalForRestore,
  TerminalExists,
  TerminalTabOp,
} from "../../../bridge/commands";
import { claudeResumeSessionId } from "../../agentSession";
import { isPeerName } from "../../peer/markers";
import { tabOpRefusal } from "../../peer/tabOpRefusal";
import { type PaneNode } from "../../paneTree";
import { replaceTabTerminal, terminalTabOf } from "./replaceTabTerminal";

interface UseTerminalRestartProps {
  projectName: string;
  treeRef: RefObject<PaneNode | null>;
  applyTree: (next: PaneNode | null, focus?: string | null) => void;
  scheduleCmdInject: (id: string, cmd: string, prompt?: string | string[]) => void;
}

// Run a terminal whose process has ended again in its own tab: a fresh shell
// that resumes the tab's agent session, or runs the command it was opened with.
// A tab on a paired machine is restarted there, in the tab tree it keeps, and
// comes back here with its next listing. One still running is left alone: a
// phone or another Mac can ask after it came back, and swapping it out would
// leave it running with no tab.
export function useTerminalRestart({
  projectName,
  treeRef,
  applyTree,
  scheduleCmdInject,
}: UseTerminalRestartProps) {
  return useCallback(
    async (oldId: string) => {
      if (await TerminalExists(oldId).catch(() => false)) return;
      if (isPeerName(oldId)) {
        await TerminalTabOp(projectName, "restart", oldId, null, null, null).catch((err) =>
          toast.error(`Couldn't restart the terminal: ${tabOpRefusal(err, "restart its terminals")}`),
        );
        return;
      }
      const tab = terminalTabOf(treeRef.current, oldId)?.tab;
      if (!tab) return;
      const cmd = tab.resumeCmd ?? tab.startCmd;
      // A Claude conversation comes back on the account holding it, which may
      // not be the one the project's new sessions use.
      const sessionId = claudeResumeSessionId(cmd);
      let newId: string | null;
      try {
        newId = await replaceTabTerminal({ treeRef, applyTree }, oldId, () =>
          tab.actionName
            ? StartTerminalForRestore(projectName, tab.actionName, sessionId)
            : StartTerminal(projectName, sessionId),
        );
      } catch (err) {
        toast.error(`Couldn't restart the terminal: ${err}`);
        return;
      }
      if (newId && cmd) scheduleCmdInject(newId, cmd);
    },
    [projectName, treeRef, applyTree, scheduleCmdInject],
  );
}
