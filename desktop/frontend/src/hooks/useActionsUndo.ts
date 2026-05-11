import { useCallback } from "react";
import { toast } from "sonner";
import { useAppStore } from "../store/app";
import { useKeyboardShortcut } from "./useKeyboardShortcut";

interface UseActionsUndoOptions {
  projectName: string;
  visible: boolean;
}

export function useActionsUndo({ projectName, visible }: UseActionsUndoOptions) {
  const undoActionsReorder = useAppStore((s) => s.undoActionsReorder);
  const redoActionsReorder = useAppStore((s) => s.redoActionsReorder);

  const handleUndo = useCallback(async () => {
    const ok = await undoActionsReorder(projectName);
    if (ok) toast("Reordered actions undone");
  }, [undoActionsReorder, projectName]);

  const handleRedo = useCallback(async () => {
    const ok = await redoActionsReorder(projectName);
    if (ok) toast("Reordered actions redone");
  }, [redoActionsReorder, projectName]);

  useKeyboardShortcut(
    [
      { key: "z", meta: true, shift: false },
      { key: "z", meta: true, shift: true },
    ],
    (_event, matched) => {
      if (matched.shift) handleRedo();
      else handleUndo();
    },
    visible,
  );
}
