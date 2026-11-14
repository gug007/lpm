import { GitRedoCommit, GitUndoCommit } from "../bridge/commands";
import { filesPhrase, type UndoneCommit } from "./commitRewrite";
import type { HistoryCommit } from "./gitHistory";
import { toast } from "./notifications/toast";
import { commitDraft, saveCommitDraft } from "./store/commitDrafts";

const UNDO_TOAST_MS = 10_000;

interface DraftChange {
  before: string;
  after: string;
}

/** The commit's message goes above a draft already there, so neither is lost. */
function draftWithMessage(draft: string, message: string): string {
  if (!draft.trim() || draft === message) return message;
  return `${message}\n\n${draft}`;
}

async function redoCommit(
  projectPath: string,
  undone: UndoneCommit,
  draft: DraftChange,
  onChanged: () => void,
): Promise<void> {
  try {
    await GitRedoCommit(projectPath, undone.hash);
    if (commitDraft(projectPath)?.message === draft.after) saveCommitDraft(projectPath, draft.before);
    toast.success("Committed again");
  } catch (err: unknown) {
    toast.error(`Couldn't redo the commit: ${String(err)}`);
  } finally {
    onChanged();
  }
}

/** Takes the newest commit back: its changes return to Commit and its message
 *  goes into the Commit dialog's draft, with Redo on the toast. */
export async function undoCommit(projectPath: string, commit: HistoryCommit, onChanged: () => void): Promise<void> {
  let undone: UndoneCommit;
  try {
    undone = await GitUndoCommit(projectPath, commit.hash);
  } catch (err: unknown) {
    toast.error(`Couldn't undo the commit: ${String(err)}`);
    return;
  }
  const before = commitDraft(projectPath)?.message ?? "";
  const draft = { before, after: draftWithMessage(before, undone.message) };
  saveCommitDraft(projectPath, draft.after);
  onChanged();
  const kept = draft.after !== undone.message;
  toast.success(`Undid “${commit.subject}”`, {
    description: `${filesPhrase(undone.files)} back in Commit, with its message${kept ? " above your draft" : ""}.`,
    duration: UNDO_TOAST_MS,
    action: { label: "Redo", onClick: () => void redoCommit(projectPath, undone, draft, onChanged) },
  });
}
