import { useCallback, useEffect, useState } from "react";
import { useFilesFocus, type FilesView } from "../../store/filesFocus";
import { useFilesView } from "../../store/filesView";
import type { useChangesView } from "./useChangesView";

const TREE_OPEN_KEY = "lpm:filesTreeOpen";

type ChangesView = ReturnType<typeof useChangesView>;

// What the rest of the app asks of a Files tab — ⌘P for the filter, ⌘⇧E and
// ⌘⇧R for a view — and what it tells back: which view its tab strip should
// name. Every request opens the rail, since that is where it lands.
export function useFilesPaneRequests(tabId: string, paneId: string, git: ChangesView) {
  const { changesOnly, showChangesOnly, showAllChanges } = git;
  const [treeOpen, setTreeOpen] = useState(() => localStorage.getItem(TREE_OPEN_KEY) !== "0");
  const [filterFocusRequest, setFilterFocusRequest] = useState(0);

  useEffect(() => {
    useFilesView.getState().setChangesOnly(tabId, changesOnly);
  }, [tabId, changesOnly]);
  useEffect(() => () => useFilesView.getState().clear(tabId), [tabId]);

  const showTree = useCallback((open: boolean) => {
    localStorage.setItem(TREE_OPEN_KEY, open ? "1" : "0");
    setTreeOpen(open);
  }, []);

  const focusFilter = useCallback(() => {
    showTree(true);
    setFilterFocusRequest((n) => n + 1);
  }, [showTree]);

  // Consumed in the same commit the tree acts on it, so a later remount of the
  // tree doesn't replay it.
  useEffect(() => {
    if (filterFocusRequest) setFilterFocusRequest(0);
  }, [filterFocusRequest]);

  const showView = useCallback(
    (view: FilesView) => {
      showTree(true);
      showChangesOnly(view === "changes");
      showAllChanges(view === "changes");
    },
    [showTree, showChangesOnly, showAllChanges],
  );

  const request = useFilesFocus((s) => s.requests[paneId]);
  useEffect(() => {
    if (!request) return;
    useFilesFocus.getState().clear(paneId);
    if (request.kind === "filter") focusFilter();
    else showView(request.kind);
  }, [request, paneId, focusFilter, showView]);

  return { treeOpen, showTree, filterFocusRequest };
}
