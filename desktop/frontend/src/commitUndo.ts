import { GitRedoCommit, GitUndoCommit } from "../bridge/commands";
import { filesPhrase, type UndoneCommit } from "./commitRewrite";
import type { HistoryCommit } from "./gitHistory";
import { toast } from "./notifications/toast";
import { clearCommitDraft, commitDraft, saveCommitDraft } from "./store/commitDrafts";

const UNDO_TOAST_MS = 10_000;

async function redoCommit(projectPath: string, undone: UndoneCommit, onChanged: () => void): Promise<void> {
  try {
    await GitRedoCommit(projectPath, undone.hash);
    if (commitDraft(projectPath)?.message === undone.message) clearCommitDraft(projectPath);
    toast.success("Committed again");
  } catch (err: unknown) {
    toast.error(`Couldn't redo the commit: ${String(err)}`);
  } finally {
    onChanged();
  }
}

/** Takes the newest commit back: its changes return to Commit and its message
 *  becomes the Commit dialog's draft, with Redo on the toast. */
export async function undoCommit(projectPath: string, commit: HistoryCommit, onChanged: () => void): Promise<void> {
  let undone: UndoneCommit;
  try {
    undone = await GitUndoCommit(projectPath, commit.hash);
  } catch (err: unknown) {
    toast.error(`Couldn't undo the commit: ${String(err)}`);
    return;
  }
  saveCommitDraft(projectPath, undone.message);
  onChanged();
  toast.success(`Undid “${commit.subject}”`, {
    description: `${filesPhrase(undone.files)} back in Commit, with its message.`,
    duration: UNDO_TOAST_MS,
    action: { label: "Redo", onClick: () => void redoCommit(projectPath, undone, onChanged) },
  });
}
