export interface ConflictFile {
  path: string;
  // <<<<<<< lines left in the working copy.
  conflicts: number;
  // 1-based line of the first of them, 0 when none is left.
  firstLine: number;
  resolved: boolean;
}

export interface MergeState {
  merging: boolean;
  source: string;
  files: ConflictFile[];
  // The AI at work on them, whoever set it on them: this dialog or a phone.
  resolving?: { line: string };
  // Only the unmerged paths are known: a paired Mac on an older lpm.
  legacy?: boolean;
}

export type ConflictSide = "ours" | "theirs";

export function stateFromPaths(paths: string[]): MergeState {
  return {
    merging: false,
    source: "",
    legacy: true,
    files: paths.map((path) => ({ path, conflicts: 0, firstLine: 0, resolved: false })),
  };
}

export function remainingFiles(state: MergeState): ConflictFile[] {
  return state.files.filter((f) => !f.resolved);
}

// Worth showing: files left to resolve, or a merge whose files are all
// resolved and only needs committing.
export function needsResolving(state: MergeState): boolean {
  return remainingFiles(state).length > 0 || (state.merging && state.files.length > 0);
}

export function progressLabel(state: MergeState): string {
  const total = state.files.length;
  const done = total - remainingFiles(state).length;
  return `${done} of ${total} file${total === 1 ? "" : "s"} resolved`;
}

export function fileStateLabel(file: ConflictFile, side?: ConflictSide, legacy = false): string {
  if (legacy) return "";
  if (file.resolved) return side ? `resolved · used ${side}` : "resolved";
  if (file.conflicts === 0) return "no markers left";
  return `${file.conflicts} conflict${file.conflicts === 1 ? "" : "s"}`;
}

export function mergeTitle(state: MergeState, target: string): string {
  if (state.source && target) return `Merging ${state.source} into ${target}`;
  if (state.source) return `Merging ${state.source}`;
  return "Merge conflicts";
}
