import { create } from "zustand";

// A deck being pulled from the row under its copies, keyed by the parent's name.
// `failed` holds the roots whose pull threw, so the row can offer Retry.
export interface DeckPull {
  total: number;
  done: number;
  running: boolean;
  failed: string[];
}

interface DeckPullState {
  decks: Record<string, DeckPull>;
  setDeck: (deck: string, pull: DeckPull | undefined) => void;
  reset: () => void;
}

export const useDeckPull = create<DeckPullState>((set) => ({
  decks: {},
  setDeck: (deck, pull) =>
    set((s) => {
      const decks = { ...s.decks };
      if (pull) decks[deck] = pull;
      else delete decks[deck];
      return { decks };
    }),
  reset: () => set({ decks: {} }),
}));
