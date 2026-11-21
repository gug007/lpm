import { create } from "zustand";
import type { PrMergeWatch } from "../types";

// The pull requests lpm is waiting to merge once their checks pass, by project
// root, as this computer or a connected one last said.
interface PrMergeWatchState {
  watches: Record<string, PrMergeWatch>;
  apply: (watch: PrMergeWatch) => void;
  forget: (path: string) => void;
}

export const usePrMergeWatch = create<PrMergeWatchState>((set) => ({
  watches: {},
  apply: (watch) =>
    set((s) => {
      if (watch.state === "waiting") return { watches: { ...s.watches, [watch.path]: watch } };
      if (!s.watches[watch.path]) return s;
      const watches = { ...s.watches };
      delete watches[watch.path];
      return { watches };
    }),
  forget: (path) =>
    set((s) => {
      if (!s.watches[path]) return s;
      const watches = { ...s.watches };
      delete watches[path];
      return { watches };
    }),
}));
