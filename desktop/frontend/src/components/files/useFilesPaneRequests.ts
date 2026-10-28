import { useCallback, useEffect, useState } from "react";
import { useFilesFocus, type FilesView } from "../../store/filesFocus";
import { useFilesView } from "../../store/filesView";
import type { useChangesView } from "./useChangesView";

const TREE_OPEN_KEY = "lpm:filesTreeOpen";

type ChangesView = ReturnType<typeof useChangesView>;

interface SearchView {
  open: boolean;
  // Opens the Search view with the field focused.
  onSearch: () => void;
  onLeaveSearch: () => void;
}

// What the rest of the app asks of a Files tab — ⌘P for the filter, ⌘⇧F for
// the Search view, ⌘⇧E and ⌘⇧R for a view — and what it tells back: which
// view its tab strip should name. Every request opens the rail, since that is
// where it lands.
export function useFilesPaneRequests(tabId: string, paneId: string, git: ChangesView, search: SearchView) {
  const { changesOnly, showChangesOnly, showAllChanges } = git;
  const { open: searching, onSearch, onLeaveSearch } = search;
  const [treeOpen, setTreeOpen] = useState(() => localStorage.getItem(TREE_OPEN_KEY) !== "0");
  const [filterFocusRequest, setFilterFocusRequest] = useState(0);

  // The Search view is neither: the tab goes back to reading "Files".
  useEffect(() => {
    useFilesView.getState().setChangesOnly(tabId, changesOnly && !searching);
  }, [tabId, changesOnly, searching]);
  useEffect(() => {
    useFilesView.getState().setSearching(tabId, searching);
  }, [tabId, searching]);
  useEffect(() => () => useFilesView.getState().clear(tabId), [tabId]);

  const showTree = useCallback((open: boolean) => {
    localStorage.setItem(TREE_OPEN_KEY, open ? "1" : "0");
    setTreeOpen(open);
  }, []);

  const focusFilter = useCallback(() => {
    showTree(true);
    onLeaveSearch();
    setFilterFocusRequest((n) => n + 1);
  }, [showTree, onLeaveSearch]);

  // Consumed in the same commit the tree acts on it, so a later remount of the
  // tree doesn't replay it.
  useEffect(() => {
    if (filterFocusRequest) setFilterFocusRequest(0);
  }, [filterFocusRequest]);

  const showView = useCallback(
    (view: FilesView) => {
      showTree(true);
      onLeaveSearch();
      showChangesOnly(view === "changes");
      showAllChanges(view === "changes");
    },
    [showTree, onLeaveSearch, showChangesOnly, showAllChanges],
  );

  const request = useFilesFocus((s) => s.requests[paneId]);
  useEffect(() => {
    if (!request) return;
    useFilesFocus.getState().clear(paneId);
    if (request.kind === "filter") focusFilter();
    else if (request.kind === "search") {
      showTree(true);
      onSearch();
    } else showView(request.kind);
  }, [request, paneId, focusFilter, showTree, onSearch, showView]);

  return { treeOpen, showTree, filterFocusRequest };
}
