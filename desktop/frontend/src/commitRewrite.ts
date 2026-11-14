import type { HistoryCommit } from "./gitHistory";

/** What git_undo_commit answers: the commit taken back, its full message, and
 *  how many files it touched. */
export interface UndoneCommit {
  hash: string;
  message: string;
  files: number;
}

interface RepoState {
  hasRemote?: boolean;
  detached?: boolean;
}

type Rewritable = Pick<HistoryCommit, "parents" | "unpushed">;

// Only while no remote has it: with no remote at all, nothing is pushed.
function rewritable(commit: Rewritable | undefined, repo: RepoState | null): commit is Rewritable {
  return !!commit && !!repo && !repo.detached && (commit.unpushed || !repo.hasRemote);
}

/** Whether the newest commit can be taken back with a soft reset. */
export function canUndoCommit(commit: Rewritable | undefined, repo: RepoState | null): boolean {
  return rewritable(commit, repo) && commit.parents === 1;
}

/** Whether the newest commit can be amended. */
export function canAmendCommit(commit: Rewritable | undefined, repo: RepoState | null): boolean {
  return rewritable(commit, repo) && commit.parents <= 1;
}

/** A commit's whole message, as `git log --format=%B` gives it. */
export function fullMessage(commit: Pick<HistoryCommit, "subject" | "body">): string {
  const body = commit.body.trim();
  return body ? `${commit.subject}\n\n${body}` : commit.subject;
}

export function filesPhrase(count: number): string {
  return count === 1 ? "1 file is" : `${count} files are`;
}
