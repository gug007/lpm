import { useCallback, useEffect, useMemo, useState } from "react";
import { indexEntry, type IndexEntry } from "./filesFilter";
import { decorate } from "./gitDecorations";
import type { ReviewScope } from "./ReviewScopeSwitch";
import { useBranchChanges } from "./useBranchChanges";
import { useChangedFiles, type ChangedFile } from "./useChangedFiles";
import { useDiffView } from "./useDiffView";
import { useFileDiscard } from "./useFileDiscard";

const CHANGES_ONLY_KEY = "lpm:filesChangesOnly";
const SIDE_BY_SIDE_KEY = "lpm:filesDiffSplit";
const WORD_WRAP_KEY = "lpm:filesDiffWrap";
const NO_DECORATIONS: ReadonlyMap<string, string> = new Map();
const NO_FILES: ChangedFile[] = [];

function useStoredFlag(key: string, fallback: boolean) {
  const [on, setOn] = useState(() => {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : stored === "1";
  });
  const set = useCallback(
    (next: boolean) => {
      localStorage.setItem(key, next ? "1" : "0");
      setOn(next);
    },
    [key],
  );
  return [on, set] as const;
}

// The git side of the Files tab: what changed, how the tree marks it, and
// which git view the editor shows — the open file against HEAD, or every
// change as one stack of diffs. `review` holds the rail on the changes and
// opens on the stack, for the commit dialog's review. The Branch scope lists
// what the branch's own commits changed instead, as a read-only stack.
export function useChangesView(
  root: string,
  selectedPath: string | null,
  active: boolean,
  review = false,
) {
  const changes = useChangedFiles(root, active);
  const files = changes.status === "ready" ? changes.files : NO_FILES;
  const [changesOnly, setChangesOnly] = useState(
    () => review || localStorage.getItem(CHANGES_ONLY_KEY) === "1",
  );
  const [scope, setScope] = useState<ReviewScope>("uncommitted");
  const branch = useBranchChanges(root, active && changesOnly && !review);
  const onBranch = scope === "branch" && changesOnly && !review;
  const branchFiles = branch.status === "ready" && branch.base ? branch.files : NO_FILES;
  const railFiles = onBranch ? branchFiles : files;
  const workingDecorations = useMemo(
    () => (changes.status === "ready" ? decorate(changes.files) : NO_DECORATIONS),
    [changes],
  );
  const branchDecorations = useMemo(() => decorate(branchFiles), [branchFiles]);
  const decorations = onBranch ? branchDecorations : workingDecorations;
  const [allWanted, setAllWanted] = useState(review);
  const [sideBySide, showSideBySide] = useStoredFlag(SIDE_BY_SIDE_KEY, true);
  const [wordWrap, showWordWrap] = useStoredFlag(WORD_WRAP_KEY, false);
  // The open file's diff is always against HEAD, so its own changes decide.
  const status = selectedPath ? workingDecorations.get(selectedPath) : undefined;
  const diff = useDiffView(root, selectedPath, status, active);
  const discard = useFileDiscard(root, changes);
  // The filter ranks the changed files rather than the project index while the
  // rail is on the git view.
  const items = useMemo<IndexEntry[] | null>(
    () => (changesOnly ? railFiles.map((f) => indexEntry(f.path, false)) : null),
    [changesOnly, railFiles],
  );

  const allChanges = allWanted && changesOnly && files.length > 0;
  // Once shown, the stack stays mounted behind an opened file, so its unsaved
  // edits and scroll position are there on the way back.
  const [stackShown, setStackShown] = useState(false);
  useEffect(() => {
    if (allChanges) setStackShown(true);
  }, [allChanges]);

  const showChangesOnly = useCallback((on: boolean) => {
    localStorage.setItem(CHANGES_ONLY_KEY, on ? "1" : "0");
    setChangesOnly(on);
    if (!on) {
      setAllWanted(false);
      setStackShown(false);
    }
  }, []);

  return {
    changes,
    files,
    scope,
    showScope: setScope,
    branch,
    onBranch,
    branchFiles,
    // What the rail lists: the uncommitted files, or the branch's.
    railChanges: onBranch ? branch : changes,
    decorations,
    status,
    diff,
    discard,
    items,
    changesOnly,
    showChangesOnly,
    // The stack exists only where there is something to stack; the last change
    // committed away hands the editor back to the open file.
    allChanges,
    stackMounted: allChanges || (stackShown && changesOnly && files.length > 0),
    showAllChanges: setAllWanted,
    sideBySide,
    showSideBySide,
    wordWrap,
    showWordWrap,
  };
}
