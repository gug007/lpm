import { create } from "zustand";

// One shared composer (terminal keyboard) for every terminal: opening it on one
// terminal keeps it open when switching to another, so the keyboard's open/close
// state survives terminal switches. `active` tracks which terminal a project's
// footer toggle currently targets.
interface ComposerStore {
  open: boolean;
  active: Record<string, string | null>; // projectName -> active terminalId
  setActive: (project: string, terminalId: string | null) => void;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const useComposerStore = create<ComposerStore>((set) => ({
  open: false,
  active: {},
  setActive: (project, terminalId) =>
    set((s) =>
      s.active[project] === terminalId ? s : { active: { ...s.active, [project]: terminalId } },
    ),
  setOpen: (open) => set((s) => (s.open === open ? s : { open })),
  toggle: () => set((s) => ({ open: !s.open })),
}));
