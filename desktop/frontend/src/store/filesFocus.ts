import { create } from "zustand";

// ⌘P asks the focused pane's Files tab to put the cursor in its filter box. The
// tab may not exist yet when the key is pressed, so the request is a per-pane
// counter the FilesPane picks up on mount or on change, then clears.
interface FilesFocusState {
  filterNonce: Record<string, number>;
  requestFilter: (paneId: string) => void;
  clearFilter: (paneId: string) => void;
}

export const useFilesFocus = create<FilesFocusState>((set) => ({
  filterNonce: {},
  requestFilter: (paneId) =>
    set((s) => ({ filterNonce: { ...s.filterNonce, [paneId]: (s.filterNonce[paneId] ?? 0) + 1 } })),
  clearFilter: (paneId) =>
    set((s) => {
      if (!(paneId in s.filterNonce)) return s;
      const next = { ...s.filterNonce };
      delete next[paneId];
      return { filterNonce: next };
    }),
}));
