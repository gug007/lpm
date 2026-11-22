import { create } from "zustand";
import type { CiFixLoop } from "../types";

// Keep fixing until green, by project, as this computer or a connected one
// last said: a running loop, or how the last one ended.
interface CiFixLoopState {
  loops: Record<string, CiFixLoop>;
  apply: (loop: CiFixLoop) => void;
  forget: (project: string) => void;
}

export const useCiFixLoops = create<CiFixLoopState>((set) => ({
  loops: {},
  apply: (loop) => set((s) => ({ loops: { ...s.loops, [loop.project]: loop } })),
  forget: (project) =>
    set((s) => {
      if (!s.loops[project]) return s;
      const loops = { ...s.loops };
      delete loops[project];
      return { loops };
    }),
}));

export function fixLoopRunning(loop: CiFixLoop | undefined): boolean {
  return loop?.state === "starting" || loop?.state === "fixing" || loop?.state === "watching";
}
