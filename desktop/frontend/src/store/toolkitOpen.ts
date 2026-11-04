import { create } from "zustand";

// Asks a project's terminal view to bring up its Agent setup tab on one item.
// The view opens the tab and clears `open`; the tab takes `target` once it has
// scanned, since a tab added just now isn't there to receive it yet.
interface ToolkitOpenState {
  open: { project: string; seq: number } | null;
  target: { project: string; path: string; seq: number } | null;
  request: (project: string, path: string) => void;
  clearOpen: () => void;
  takeTarget: (project: string) => string | null;
}

let seq = 0;

export const useToolkitOpen = create<ToolkitOpenState>((set, get) => ({
  open: null,
  target: null,
  request: (project, path) => {
    seq += 1;
    set({ open: { project, seq }, target: { project, path, seq } });
  },
  clearOpen: () => set({ open: null }),
  takeTarget: (project) => {
    const target = get().target;
    if (!target || target.project !== project) return null;
    set({ target: null });
    return target.path;
  },
}));
