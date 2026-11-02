import { create } from "zustand";

// A Claude tab on its way to another account: the account's name, and the
// terminal the tab ran before the move.
export interface ClaudeSwitch {
  to: string;
  from: string;
}

// Claude tabs moving to another account, by the tab's historyKey, which
// outlives the move to a new terminal. Shown over the tab until Claude is back.
interface ClaudeSwitchesState {
  switches: Record<string, ClaudeSwitch>;
  begin: (tabKey: string, move: ClaudeSwitch) => void;
  end: (tabKey: string) => void;
}

export const useClaudeSwitches = create<ClaudeSwitchesState>((set) => ({
  switches: {},
  begin: (tabKey, move) => set((s) => ({ switches: { ...s.switches, [tabKey]: move } })),
  end: (tabKey) =>
    set((s) => {
      if (!(tabKey in s.switches)) return s;
      const { [tabKey]: _, ...rest } = s.switches;
      return { switches: rest };
    }),
}));
