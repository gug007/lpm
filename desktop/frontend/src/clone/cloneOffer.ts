import { create } from "zustand";

// Repos copied to the clipboard that the user waved off ("Not now") or already
// cloned, so the offer to clone them doesn't come back.
const DISMISSED_KEY = "lpm-clone-offer-dismissed";
const MAX_DISMISSED = 50;

function readDismissed(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === "string") : [];
  } catch {
    return [];
  }
}

function writeDismissed(urls: string[]): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(urls));
  } catch {
    /* storage may be full or disabled */
  }
}

interface CloneOfferState {
  dismissed: string[];
  // The URL the clone dialog opens with, taken once when it opens.
  prefillUrl: string | null;
  dismiss: (url: string) => void;
  prefill: (url: string) => void;
  takePrefill: () => string | null;
}

export const useCloneOffer = create<CloneOfferState>((set, get) => ({
  dismissed: readDismissed(),
  prefillUrl: null,

  dismiss: (url) =>
    set((s) => {
      if (s.dismissed.includes(url)) return s;
      const dismissed = [...s.dismissed, url].slice(-MAX_DISMISSED);
      writeDismissed(dismissed);
      return { dismissed };
    }),

  prefill: (url) => set({ prefillUrl: url }),

  takePrefill: () => {
    const url = get().prefillUrl;
    if (url) set({ prefillUrl: null });
    return url;
  },
}));
