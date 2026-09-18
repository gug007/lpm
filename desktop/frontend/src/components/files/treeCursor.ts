import { createStore, type StoreApi } from "zustand/vanilla";

// The selected row and the keyboard cursor, kept outside the tree's render so
// moving either re-renders the rows it leaves and lands on, not the whole list.
export interface TreeCursorState {
  selectedPath: string | null;
  cursorPath: string | null;
  listFocused: boolean;
}

export type TreeCursorStore = StoreApi<TreeCursorState>;

export function createTreeCursorStore(): TreeCursorStore {
  return createStore<TreeCursorState>(() => ({
    selectedPath: null,
    cursorPath: null,
    listFocused: false,
  }));
}
