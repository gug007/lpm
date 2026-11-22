import { create } from "zustand";
import { rememberedMiniViewSize, type MiniViewSize } from "../miniViewSize";
import type { AICLI } from "../types";

// Tabs kept in a mini view: a small live view of a terminal in the corner of
// the main window, there across project switches (MiniViewHost). Only this
// window's sessions can be shown, so detached windows keep none.
export interface MiniView {
  termId: string;
  project: string;
  // The tab's name when it was kept, until the tab strip publishes a newer one.
  label: string;
  // The agent the tab runs, from its command, for when no status names it.
  agent?: AICLI | null;
  // Set when the view is kept, from the size last dragged to.
  size?: MiniViewSize;
}

export const MAX_MINI_VIEWS = 2;

interface MiniViewsState {
  views: MiniView[];
  // Adds a view, or takes it out when it's already kept. A third pushes out the
  // one kept longest; that one is returned so the caller can say so.
  toggle: (view: MiniView) => { kept: boolean; replaced: MiniView | null };
  drop: (termId: string) => void;
  resize: (termId: string, size: MiniViewSize) => void;
}

export const useMiniViews = create<MiniViewsState>((set, get) => ({
  views: [],
  toggle: (view) => {
    const { views } = get();
    if (views.some((v) => v.termId === view.termId)) {
      set({ views: views.filter((v) => v.termId !== view.termId) });
      return { kept: false, replaced: null };
    }
    const full = views.length >= MAX_MINI_VIEWS;
    const kept = { ...view, size: view.size ?? rememberedMiniViewSize() };
    set({ views: [...(full ? views.slice(1) : views), kept] });
    return { kept: true, replaced: full ? views[0] : null };
  },
  drop: (termId) =>
    set((s) => (s.views.some((v) => v.termId === termId) ? { views: s.views.filter((v) => v.termId !== termId) } : s)),
  resize: (termId, size) =>
    set((s) => ({ views: s.views.map((v) => (v.termId === termId ? { ...v, size } : v)) })),
}));
