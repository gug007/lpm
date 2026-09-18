import { useCallback, useMemo, useState } from "react";
import { indexEntry, type IndexEntry } from "./filesFilter";
import { decorate } from "./gitDecorations";
import { useChangedFiles, type ChangedFile } from "./useChangedFiles";
import { useDiffView } from "./useDiffView";
import { useFileDiscard } from "./useFileDiscard";

const CHANGES_ONLY_KEY = "lpm:filesChangesOnly";
const SIDE_BY_SIDE_KEY = "lpm:filesDiffSplit";
const NO_DECORATIONS: ReadonlyMap<string, string> = new Map();
const NO_FILES: ChangedFile[] = [];

// The git side of the Files tab: what changed, how the tree marks it, and
// which git view the editor shows — the open file against HEAD, or every
// change as one stack of diffs.
export function useChangesView(root: string, selectedPath: string | null, active: boolean) {
  const changes = useChangedFiles(root, active);
  const files = changes.status === "ready" ? changes.files : NO_FILES;
  const decorations = useMemo(
    () => (changes.status === "ready" ? decorate(changes.files) : NO_DECORATIONS),
    [changes],
  );
  const [changesOnly, setChangesOnly] = useState(
    () => localStorage.getItem(CHANGES_ONLY_KEY) === "1",
  );
  const [allWanted, setAllWanted] = useState(false);
  const [sideBySide, setSideBySide] = useState(
    () => localStorage.getItem(SIDE_BY_SIDE_KEY) !== "0",
  );
  const status = selectedPath ? decorations.get(selectedPath) : undefined;
  const diff = useDiffView(root, selectedPath, status, active);
  const discard = useFileDiscard(root, changes);
  // The filter ranks the changed files rather than the project index while the
  // rail is on the git view.
  const items = useMemo<IndexEntry[] | null>(
    () => (changesOnly ? files.map((f) => indexEntry(f.path, false)) : null),
    [changesOnly, files],
  );

  const showChangesOnly = useCallback((on: boolean) => {
    localStorage.setItem(CHANGES_ONLY_KEY, on ? "1" : "0");
    setChangesOnly(on);
    if (!on) setAllWanted(false);
  }, []);

  const showSideBySide = useCallback((on: boolean) => {
    localStorage.setItem(SIDE_BY_SIDE_KEY, on ? "1" : "0");
    setSideBySide(on);
  }, []);

  return {
    changes,
    files,
    decorations,
    status,
    diff,
    discard,
    items,
    changesOnly,
    showChangesOnly,
    // The stack exists only where there is something to stack; the last change
    // committed away hands the editor back to the open file.
    allChanges: allWanted && changesOnly && files.length > 0,
    showAllChanges: setAllWanted,
    sideBySide,
    showSideBySide,
  };
}
