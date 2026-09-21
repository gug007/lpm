import { create } from "zustand";
import { EMPTY_PICK, type ModelPick } from "../agentModelSwitch";

// The model/effort lpm last saw a terminal's agent running, keyed by terminal id.
// It lives outside the composer because the composer is keyed by terminal and
// remounts on every switch, which would otherwise forget the reading each time
// you look at another tab. Session-scoped on purpose: a restarted agent reads
// its own config, so a pick remembered across app restarts would be a guess.
interface AgentModelPickStore {
  byTerminal: Record<string, ModelPick>;
  // When the evidence behind each terminal's level was true — not when it was
  // written here. A reading taken off the pane is stamped now; one read out of a
  // transcript is stamped with the record's own time, so the two can be ordered
  // and the older one can't talk the newer one down.
  effortAt: Record<string, number>;
  setPick: (terminalId: string, pick: ModelPick, at: number) => void;
}

function samePick(a: ModelPick | undefined, b: ModelPick): boolean {
  return a !== undefined && a.model === b.model && a.effort === b.effort;
}

export const useAgentModelPicks = create<AgentModelPickStore>((set) => ({
  byTerminal: {},
  effortAt: {},
  setPick: (terminalId, pick, at) =>
    set((s) => {
      const effortAt = pick.effort ? { ...s.effortAt, [terminalId]: at } : s.effortAt;
      return samePick(s.byTerminal[terminalId], pick)
        ? { effortAt }
        : { byTerminal: { ...s.byTerminal, [terminalId]: pick }, effortAt };
    }),
}));

export function agentModelPick(terminalId: string): ModelPick {
  return useAgentModelPicks.getState().byTerminal[terminalId] ?? EMPTY_PICK;
}

/** When what lpm believes about this terminal's level was actually true, in
 *  epoch millis — 0 when the level was never established. */
export function agentModelEffortAt(terminalId: string): number {
  return useAgentModelPicks.getState().effortAt[terminalId] ?? 0;
}

/** Replace both halves outright. The one way to *clear* a half — merging can
 *  only ever add, since an empty half reads as "no news". */
export function setAgentModelPick(terminalId: string, pick: ModelPick, at = Date.now()): void {
  useAgentModelPicks.getState().setPick(terminalId, pick, at);
}

/** Record only the halves this reading actually established, keeping whatever
 *  was known about the other. A pick sets one half at a time, and a readback can
 *  name a model without naming its level — neither is evidence about the half it
 *  says nothing about. */
export function mergeAgentModelPick(
  terminalId: string,
  pick: Partial<ModelPick>,
  at = Date.now(),
): void {
  const prev = agentModelPick(terminalId);
  useAgentModelPicks.getState().setPick(
    terminalId,
    {
      model: pick.model || prev.model,
      effort: pick.effort || prev.effort,
    },
    pick.effort ? at : agentModelEffortAt(terminalId),
  );
}
