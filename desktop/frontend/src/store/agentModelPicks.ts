import { create } from "zustand";
import { EMPTY_PICK, type ModelPick } from "../agentModelSwitch";

// The model/effort lpm last saw a terminal's agent running, keyed by terminal id.
// It lives outside the composer because the composer is keyed by terminal and
// remounts on every switch, which would otherwise forget the reading each time
// you look at another tab. Session-scoped on purpose: a restarted agent reads
// its own config, so a pick remembered across app restarts would be a guess.
interface AgentModelPickStore {
  byTerminal: Record<string, ModelPick>;
  setPick: (terminalId: string, pick: ModelPick) => void;
}

function samePick(a: ModelPick | undefined, b: ModelPick): boolean {
  return a !== undefined && a.model === b.model && a.effort === b.effort;
}

export const useAgentModelPicks = create<AgentModelPickStore>((set) => ({
  byTerminal: {},
  setPick: (terminalId, pick) =>
    set((s) =>
      samePick(s.byTerminal[terminalId], pick)
        ? s
        : { byTerminal: { ...s.byTerminal, [terminalId]: pick } },
    ),
}));

export function agentModelPick(terminalId: string): ModelPick {
  return useAgentModelPicks.getState().byTerminal[terminalId] ?? EMPTY_PICK;
}

/** Replace both halves outright. The one way to *clear* a half — merging can
 *  only ever add, since an empty half reads as "no news". */
export function setAgentModelPick(terminalId: string, pick: ModelPick): void {
  useAgentModelPicks.getState().setPick(terminalId, pick);
}

/** Record only the halves this reading actually established, keeping whatever
 *  was known about the other. A pick sets one half at a time, and a readback can
 *  name a model without naming its level — neither is evidence about the half it
 *  says nothing about. */
export function mergeAgentModelPick(terminalId: string, pick: Partial<ModelPick>): void {
  const prev = agentModelPick(terminalId);
  useAgentModelPicks.getState().setPick(terminalId, {
    model: pick.model || prev.model,
    effort: pick.effort || prev.effort,
  });
}
