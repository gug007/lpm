import { useEffect } from "react";
import { create } from "zustand";

// In-pane browser webviews float ABOVE the React DOM, so they park themselves
// while count > 0 — otherwise they'd cover modals/menus. Overlays register via useOverlay().
interface OverlayState {
  count: number;
  push: () => void;
  pop: () => void;
}

export const useOverlayStore = create<OverlayState>((set) => ({
  count: 0,
  push: () => set((s) => ({ count: s.count + 1 })),
  pop: () => set((s) => ({ count: Math.max(0, s.count - 1) })),
}));

export function useOverlay(active = true): void {
  useEffect(() => {
    if (!active) return;
    const { push, pop } = useOverlayStore.getState();
    push();
    return pop;
  }, [active]);
}
