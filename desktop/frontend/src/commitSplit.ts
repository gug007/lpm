/** One commit of a split: its message and the files that go into it. */
export interface CommitGroup {
  message: string;
  files: string[];
}

/** Moves `file` into group `to`, or into a new last group when `to` is past
 *  the end. A group left with no files goes. */
export function moveFile(groups: CommitGroup[], file: string, to: number): CommitGroup[] {
  const next = groups.map((group) => ({ ...group, files: group.files.filter((f) => f !== file) }));
  if (to >= next.length) next.push({ message: "", files: [file] });
  else next[to] = { ...next[to], files: [...next[to].files, file] };
  return next.filter((group) => group.files.length > 0);
}

export function withMessage(groups: CommitGroup[], index: number, message: string): CommitGroup[] {
  return groups.map((group, i) => (i === index ? { ...group, message } : group));
}

export function readyToCommit(groups: CommitGroup[]): boolean {
  return groups.length > 0 && groups.every((group) => group.message.trim() !== "" && group.files.length > 0);
}

export interface SplitCommitResult {
  /** How many groups landed, in order. */
  done: number;
  error?: string;
}

/** Commits `groups` in order, stopping at the first that fails; the ones
 *  before it stay committed. */
export async function commitGroups(
  groups: CommitGroup[],
  commit: (message: string, files: string[]) => Promise<unknown>,
): Promise<SplitCommitResult> {
  for (let i = 0; i < groups.length; i++) {
    try {
      await commit(groups[i].message.trim(), groups[i].files);
    } catch (err) {
      return { done: i, error: String(err) };
    }
  }
  return { done: groups.length };
}
