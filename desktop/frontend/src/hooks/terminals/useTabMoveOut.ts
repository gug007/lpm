import { useCallback, type RefObject } from "react";
import { MoveTerminal } from "../../../bridge/commands";
import { IS_MIRROR_WINDOW } from "../../mirror";
import { markMoving } from "../../movingTabs";
import { toast } from "../../notifications/toast";
import { detachTab } from "../../paneMoves";
import type { PaneNode } from "../../paneTree";
import { useAppStore } from "../../store/app";
import { movedNote } from "../../tabMove";
import { terminalTabOf } from "./replaceTabTerminal";

interface UseTabMoveOutProps {
  projectName: string;
  treeRef: RefObject<PaneNode | null>;
  restoreSettled: RefObject<Promise<void>>;
  applyTree: (next: PaneNode | null) => void;
}

// Hands one of this project's running tabs to project `dest` (tabMove.ts). The
// backend files the terminal and its agent's statuses there first; only then
// does the tab leave this tree, untouched, for the other project's to take in.
export function useTabMoveOut({ projectName, treeRef, restoreSettled, applyTree }: UseTabMoveOutProps) {
  return useCallback(
    async (termId: string, dest: string) => {
      if (IS_MIRROR_WINDOW || dest === projectName) return;
      await restoreSettled.current;
      if (!terminalTabOf(treeRef.current, termId)) return;
      let folder: string;
      try {
        folder = await MoveTerminal(termId, dest);
      } catch (err) {
        toast.error(`Couldn't move the tab: ${String(err)}`);
        return;
      }
      const tree = treeRef.current;
      const at = terminalTabOf(tree, termId);
      const detached = tree && at ? detachTab(tree, at.paneId, termId) : null;
      if (!detached) return;
      markMoving(termId);
      applyTree(detached.tree);
      useAppStore.getState().takeInTerminal(dest, { ...detached.term, cwd: detached.term.cwd ?? (folder || undefined) });
      toast(movedNote(projectName, dest));
    },
    [projectName, applyTree],
  );
}
