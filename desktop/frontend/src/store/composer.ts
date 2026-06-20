import { create } from "zustand";
import { saveSettings } from "./settings";

// One shared composer (terminal keyboard) for every terminal: opening it on one
// terminal keeps it open when switching to another, so the keyboard's open/close
// state survives terminal switches. The open/close flag is persisted to
// settings.json (via `hydrate` at startup and a write on every change) so the
// keyboard comes back in the same state after a restart. `active` tracks which
// terminal a project's footer toggle currently targets.
interface ComposerStore {
  open: boolean;
  active: Record<string, string | null>; // projectName -> active terminalId
  hydrate: (open: boolean) => void;
  setActive: (project: string, terminalId: string | null) => void;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const useComposerStore = create<ComposerStore>((set) => ({
  open: false,
  active: {},
  // Set the startup value from settings.json without echoing it back to disk.
  hydrate: (open) => set((s) => (s.open === open ? s : { open })),
  setActive: (project, terminalId) =>
    set((s) =>
      s.active[project] === terminalId ? s : { active: { ...s.active, [project]: terminalId } },
    ),
  setOpen: (open) =>
    set((s) => {
      if (s.open === open) return s;
      void saveSettings({ composerOpen: open });
      return { open };
    }),
  toggle: () =>
    set((s) => {
      const open = !s.open;
      void saveSettings({ composerOpen: open });
      return { open };
    }),
}));
