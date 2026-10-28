import { create } from "zustand";

// Which Files tabs sit on their Changes view, keyed by tab id, so the tab strip
// can name and mark the tab after what it shows, and which on their Search
// view, so ⌘⇧E brings back the tree there instead of closing the tab. Written
// by FilesPane.
interface FilesViewState {
  changesOnly: Record<string, boolean>;
  searching: Record<string, boolean>;
  setChangesOnly: (id: string, on: boolean) => void;
  setSearching: (id: string, on: boolean) => void;
  clear: (id: string) => void;
}

function without(map: Record<string, boolean>, id: string): Record<string, boolean> {
  const next = { ...map };
  delete next[id];
  return next;
}

export const useFilesView = create<FilesViewState>((set) => ({
  changesOnly: {},
  searching: {},
  setChangesOnly: (id, on) =>
    set((s) => (s.changesOnly[id] === on ? s : { changesOnly: { ...s.changesOnly, [id]: on } })),
  setSearching: (id, on) =>
    set((s) => ((s.searching[id] ?? false) === on ? s : { searching: { ...s.searching, [id]: on } })),
  clear: (id) =>
    set((s) => {
      if (!(id in s.changesOnly) && !(id in s.searching)) return s;
      return { changesOnly: without(s.changesOnly, id), searching: without(s.searching, id) };
    }),
}));
