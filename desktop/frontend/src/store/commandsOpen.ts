import { create } from "zustand";

// Asks a project's terminal view to bring up its Commands tab: from the `/`
// menu's Manage skills row, or from Save as skill with the prompt to save.
// The view opens the tab and clears `open`; the tab takes `draft` once it has
// mounted, since a tab added just now isn't there to receive it yet.
interface CommandsOpenState {
  open: { project: string; seq: number } | null;
  draft: { project: string; body: string; seq: number } | null;
  request: (project: string, body?: string) => void;
  clearOpen: () => void;
  takeDraft: (project: string) => string | null;
}

let seq = 0;

export const useCommandsOpen = create<CommandsOpenState>((set, get) => ({
  open: null,
  draft: null,
  request: (project, body) => {
    seq += 1;
    set({
      open: { project, seq },
      ...(body !== undefined ? { draft: { project, body, seq } } : {}),
    });
  },
  clearOpen: () => set({ open: null }),
  takeDraft: (project) => {
    const draft = get().draft;
    if (!draft || draft.project !== project) return null;
    set({ draft: null });
    return draft.body;
  },
}));
