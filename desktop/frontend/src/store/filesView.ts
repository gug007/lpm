import { create } from "zustand";
import type { FilesView } from "./filesFocus";

// What a Files tab's rail shows.
export type RailView = FilesView | "search";

// Which view each Files tab's rail is on, keyed by tab id, so the tab strip
// can name and mark the tab after it, and ⌘⇧E / ⌘⇧R know whether they'd
// close the tab or switch it. Written by FilesPane.
interface FilesViewState {
  views: Record<string, RailView>;
  setView: (id: string, view: RailView) => void;
  clear: (id: string) => void;
}

export const useFilesView = create<FilesViewState>((set) => ({
  views: {},
  setView: (id, view) => set((s) => (s.views[id] === view ? s : { views: { ...s.views, [id]: view } })),
  clear: (id) =>
    set((s) => {
      if (!(id in s.views)) return s;
      const views = { ...s.views };
      delete views[id];
      return { views };
    }),
}));
