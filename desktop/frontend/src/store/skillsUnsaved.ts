import { create } from "zustand";

// The Skills tabs whose editor holds changes not saved yet, by tab id, so the
// tab strip can mark them.

interface SkillsUnsavedState {
  tabs: ReadonlySet<string>;
  set: (tabId: string, unsaved: boolean) => void;
}

export const useSkillsUnsaved = create<SkillsUnsavedState>((set) => ({
  tabs: new Set(),
  set: (tabId, unsaved) =>
    set((s) => {
      if (s.tabs.has(tabId) === unsaved) return s;
      const tabs = new Set(s.tabs);
      if (unsaved) tabs.add(tabId);
      else tabs.delete(tabId);
      return { tabs };
    }),
}));
