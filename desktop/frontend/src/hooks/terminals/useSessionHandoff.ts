import { useCallback, type RefObject } from "react";
import { HandoffSend, HandoffTake, StopTerminal } from "../../../bridge/commands";
import { EventsOn } from "../../../bridge/runtime";
import { MACHINE } from "../../machineWords";
import { IS_MIRROR_WINDOW } from "../../mirror";
import { toast } from "../../notifications/toast";
import { findTerminalLocation, terminalDisplayLabel, type PaneNode } from "../../paneTree";
import { isPeerName } from "../../peer/markers";
import {
  handoffPhaseText,
  handoffSessionId,
  type HandoffPhase,
  type HandoffTarget,
} from "../../sessionHandoff";
import { useAppStore } from "../../store/app";
import { errorText } from "../useJobCommands";
import { terminalTabOf } from "./replaceTabTerminal";
import { CONTINUE_PROMPT } from "./useClaudeAccountSwitch";

interface HandoffProgress {
  terminalId: string;
  phase: HandoffPhase;
  done: number;
  total: number;
}

interface UseSessionHandoffProps {
  projectName: string;
  treeRef: RefObject<PaneNode | null>;
  closeTerminal: (paneId: string, tabIdx: number, opts?: { stop?: boolean; force?: boolean }) => void;
  // Brings the conversation back where it was when it couldn't move.
  restartTerminal: (terminalId: string) => Promise<void>;
  forward: (kind: string, ...args: unknown[]) => void;
}

// Continue a Claude tab's session on another computer: its work, committed or
// not, and its conversation go to the same project there, a tab resumes it
// there, and this one closes. From a paired computer's project the same move
// brings the session to this one. A session that couldn't move resumes where
// it was.
export function useSessionHandoff({
  projectName,
  treeRef,
  closeTerminal,
  restartTerminal,
  forward,
}: UseSessionHandoffProps) {
  return useCallback(
    async (terminalId: string, target: HandoffTarget) => {
      if (IS_MIRROR_WINDOW) return forward("continueSessionOn", terminalId, target);
      const tab = terminalTabOf(treeRef.current, terminalId)?.tab;
      const sessionId = tab ? handoffSessionId(tab) : null;
      const { project, root, slug } = target;
      if (!tab?.resumeCmd || !sessionId || !project || !root) return;
      const resumeCmd = tab.resumeCmd;

      const taking = isPeerName(projectName);
      const name = terminalDisplayLabel(tab);
      const moving = `Moving ${name} to ${target.label}`;
      const id = toast.loading(moving);
      const stopListening = EventsOn("handoff-progress", (p: HandoffProgress) => {
        if (p.terminalId !== terminalId) return;
        toast.loading(moving, { id, description: handoffPhaseText(p.phase, p.done, p.total) });
      });
      try {
        const { error, branch, carriesOn } = await (taking
          ? HandoffTake(project, terminalId, sessionId, slug, root)
          : HandoffSend(projectName, terminalId, sessionId, slug, root));
        if (error !== undefined) {
          await restartTerminal(terminalId).catch(() => {});
          throw new Error(error);
        }
        const store = useAppStore.getState();
        store.queueSpawnTask(project, {
          kind: "fork",
          command: resumeCmd,
          prompt: carriesOn ? CONTINUE_PROMPT : undefined,
          label: tab.label,
          startCmd: tab.startCmd,
          resumeCmd,
          emoji: tab.emoji,
          color: tab.color,
        });
        // The other computer kept the stopped tab in case the move failed.
        if (taking) StopTerminal(terminalId).catch(() => {});
        const at = treeRef.current ? findTerminalLocation(treeRef.current, terminalId) : null;
        if (at) closeTerminal(at.paneId, at.tabIdx, { stop: false, force: true });
        store.selectProject(project);
        toast.success(`${name} continues on ${target.label}`, {
          id,
          description: taking ? `On ${branch}` : `On ${branch}. ${MACHINE.ThisMachine} can sleep`,
        });
      } catch (err) {
        toast.error(`Couldn't move ${name} to ${target.label}`, { id, description: errorText(err) });
      } finally {
        stopListening();
      }
    },
    [projectName, treeRef, closeTerminal, restartTerminal, forward],
  );
}
