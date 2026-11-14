import type { CommandMap } from "../backend";
import { emitEvent } from "../ipc";
import { wait } from "../wait";
import type { ClonePhase } from "../../clone/cloneProgress";

const STEP_MS = 90;
const OBJECTS = 1840;
const MIB = 48;

const running = new Map<string, { cancelled: boolean }>();

const STEPS: { phase: ClonePhase; percents: number[]; total: number }[] = [
  { phase: "counting", percents: [40, 100], total: OBJECTS },
  { phase: "compressing", percents: [55, 100], total: 1210 },
  { phase: "receiving", percents: [8, 21, 37, 52, 66, 79, 91, 100], total: OBJECTS },
  { phase: "resolving", percents: [45, 100], total: 760 },
  { phase: "checkout", percents: [60, 100], total: 312 },
];

function emit(id: string, phase: ClonePhase, percent: number, total: number) {
  const receiving = phase === "receiving";
  emitEvent("clone-progress", {
    id,
    phase,
    percent,
    done: Math.round((total * percent) / 100),
    total,
    size: receiving ? `${((MIB * percent) / 100).toFixed(2)} MiB` : null,
    speed: receiving && percent < 100 ? "11.40 MiB/s" : null,
    finished: percent === 100,
  });
}

// The clone dialog's progress, played for a pretend clone; rejects the way a
// cancelled clone does.
export async function playClone(id: string | undefined): Promise<void> {
  if (!id) return wait(1200);
  const run = { cancelled: false };
  running.set(id, run);
  try {
    for (const step of STEPS) {
      for (const percent of step.percents) {
        await wait(STEP_MS);
        if (run.cancelled) throw new Error("Clone cancelled.");
        emit(id, step.phase, percent, step.total);
      }
    }
  } finally {
    running.delete(id);
  }
}

export const cloneCommands: CommandMap = {
  cancel_clone: ({ id }) => {
    const run = running.get(String(id));
    if (run) run.cancelled = true;
    return Boolean(run);
  },
};
