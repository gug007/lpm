import { create } from "zustand";

// Bridges imperative "bring the active tab into view" requests (e.g. a reuse
// action that re-targets the already-active tab, so no pane state changes) to
// the PaneView that owns the strip. Each request bumps a per-pane counter the
// PaneView watches; the value itself is meaningless, only its change matters.
interface TabScrollState {
  nonce: Record<string, number>;
  requestScroll: (paneId: string) => void;
}

export const useTabScroll = create<TabScrollState>((set) => ({
  nonce: {},
  requestScroll: (paneId) =>
    set((s) => ({ nonce: { ...s.nonce, [paneId]: (s.nonce[paneId] ?? 0) + 1 } })),
}));
