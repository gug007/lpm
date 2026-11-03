import { useCallback, type RefObject } from "react";
import { toast } from "../../notifications/toast";
import {
  MoveClaudeTabToAccount,
  StartTerminal,
  StartTerminalForRestore,
  StopTerminal,
  TerminalTabOp,
} from "../../../bridge/commands";
import { agentSessionOf } from "../../agentSession";
import { accountLabel } from "../../claudePoolText";
import { isClaudeTab } from "../../claudeTab";
import { IS_MIRROR_WINDOW } from "../../mirror";
import { expectHostSwap, settleHostSwap } from "../../peer/hostSwaps";
import { isPeerName } from "../../peer/markers";
import { tabOpRefusal } from "../../peer/tabOpRefusal";
import { type PaneNode } from "../../paneTree";
import { useClaudeSwitches } from "../../store/claudeSwitches";
import { whenClaudeBack } from "./claudeBack";
import { replaceTabTerminal, terminalTabOf } from "./replaceTabTerminal";
import { foldAgentPrompt } from "./util";

// Sent to a conversation whose turn was cut short, by the move or by its
// account's limit, so the work goes on.
const CONTINUE_PROMPT = "Continue where you left off.";

interface UseClaudeAccountSwitchProps {
  projectName: string;
  treeRef: RefObject<PaneNode | null>;
  applyTree: (next: PaneNode | null, focus?: string | null) => void;
  scheduleCmdInject: (id: string, cmd: string, prompt?: string | string[]) => void;
  forward: (kind: string, ...args: unknown[]) => void;
  // Brings the conversation back on its own account when it couldn't move.
  restartTerminal: (terminalId: string) => Promise<void>;
}

// Move a Claude tab to another of the user's accounts, only ever on their
// click: a new terminal on that account takes the tab's place, the old one
// stops (a running turn interrupted first), its conversation moves over, and
// the new terminal continues it, carrying on an interrupted turn. A tab on a
// paired machine is moved by that machine, in the tab tree it keeps.
export function useClaudeAccountSwitch({
  projectName,
  treeRef,
  applyTree,
  scheduleCmdInject,
  forward,
  restartTerminal,
}: UseClaudeAccountSwitchProps) {
  return useCallback(
    async (oldId: string, account: string, label = accountLabel(account)) => {
      if (IS_MIRROR_WINDOW) return forward("switchClaudeAccount", oldId, account, label);
      const tab = terminalTabOf(treeRef.current, oldId)?.tab;
      if (!tab || !isClaudeTab(tab)) return;

      const onHost = async () => {
        const swapped = expectHostSwap(oldId);
        await TerminalTabOp(projectName, "account", oldId, null, null, null, account).catch((err) => {
          settleHostSwap(oldId, null);
          throw err;
        });
        const newId = await swapped;
        if (newId) await whenClaudeBack(projectName, newId, "either");
      };

      // The tab moves to the new terminal before the old one stops, so the old
      // one's last output and its exit never show.
      const here = async () => {
        const sessionId = agentSessionOf(tab)?.sessionId ?? null;
        const newId = await replaceTabTerminal({ treeRef, applyTree }, oldId, () =>
          tab.actionName
            ? StartTerminalForRestore(projectName, tab.actionName, undefined, account)
            : StartTerminal(projectName, undefined, undefined, undefined, account),
        );
        if (!newId) return;
        const { moved, carriesOn: cutShort } = await MoveClaudeTabToAccount(
          projectName,
          oldId,
          sessionId,
          account,
        ).catch(async (err) => {
          // The conversation stayed where it was, so it continues there.
          await Promise.all([StopTerminal(oldId), StopTerminal(newId)].map((p) => p.catch(() => {})));
          await restartTerminal(newId);
          throw err;
        });
        // Nothing saved yet means nothing to resume: start the session afresh.
        const cmd = moved ? tab.resumeCmd : tab.startCmd;
        if (!cmd) return;
        const carriesOn = moved && cutShort;
        const launch = carriesOn ? foldAgentPrompt(cmd, CONTINUE_PROMPT) : { cmd };
        const back = whenClaudeBack(projectName, newId, carriesOn ? "working" : "settled");
        scheduleCmdInject(newId, launch.cmd, launch.prompt);
        await back;
      };

      // Until Claude is back, the tab shows where it's going instead of the
      // session stopping and the shell starting underneath.
      const switches = useClaudeSwitches.getState();
      const tabKey = tab.historyKey ?? oldId;
      switches.begin(tabKey, { to: label, from: oldId });
      try {
        await (isPeerName(oldId) ? onHost() : here());
      } catch (err) {
        toast.error(`Couldn't switch the Claude account: ${tabOpRefusal(err, "switch its tabs' accounts")}`);
      } finally {
        switches.end(tabKey);
      }
    },
    [projectName, treeRef, applyTree, scheduleCmdInject, forward, restartTerminal],
  );
}
