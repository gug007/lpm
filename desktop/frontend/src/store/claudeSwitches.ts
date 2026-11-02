import { create } from "zustand";

// Claude tabs on their way to another account, by the tab's historyKey, which
// outlives the move to a new terminal: the name of the account each is moving
// to, shown over the tab until Claude is back there.
interface ClaudeSwitchesState {
  switches: Record<string, string>;
  begin: (tabKey: string, accountLabel: string) => void;
  end: (tabKey: string) => void;
}

export const useClaudeSwitches = create<ClaudeSwitchesState>((set) => ({
  switches: {},
  begin: (tabKey, accountLabel) => set((s) => ({ switches: { ...s.switches, [tabKey]: accountLabel } })),
  end: (tabKey) =>
    set((s) => {
      if (!(tabKey in s.switches)) return s;
      const { [tabKey]: _, ...rest } = s.switches;
      return { switches: rest };
    }),
}));
