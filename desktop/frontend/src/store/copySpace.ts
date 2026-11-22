import { create } from "zustand";

// Which project's copies the Free space panel shows: the original's name, which
// every copy names as its parent. Null while the panel is closed.
interface CopySpaceState {
  original: string | null;
  open: (original: string) => void;
  close: () => void;
}

export const useCopySpaceStore = create<CopySpaceState>((set) => ({
  original: null,
  open: (original) => set({ original }),
  close: () => set({ original: null }),
}));
