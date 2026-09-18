import { create } from "zustand";

// Which Files tabs sit on their Changes view, keyed by tab id, so the tab strip
// can name and mark the tab after what it shows. Written by FilesPane.
interface FilesViewState {
  changesOnly: Record<string, boolean>;
  setChangesOnly: (id: string, on: boolean) => void;
  clear: (id: string) => void;
}

export const useFilesView = create<FilesViewState>((set) => ({
  changesOnly: {},
  setChangesOnly: (id, on) =>
    set((s) => (s.changesOnly[id] === on ? s : { changesOnly: { ...s.changesOnly, [id]: on } })),
  clear: (id) =>
    set((s) => {
      if (!(id in s.changesOnly)) return s;
      const next = { ...s.changesOnly };
      delete next[id];
      return { changesOnly: next };
    }),
}));
