import { useEffect } from "react";
import { CiFixLoopState } from "../../bridge/commands";
import { useCiFixLoops } from "../store/ciFixLoop";
import type { CiFixLoop } from "../types";

// The project's Keep fixing until green loop, asked for when the menu opens so a
// reload, or a connected computer's loop, shows too; events keep it current.
export function useCiFixLoop(projectName: string, enabled: boolean): CiFixLoop | undefined {
  const loop = useCiFixLoops((s) => s.loops[projectName]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    CiFixLoopState(projectName)
      .then((found) => {
        if (!live) return;
        if (found) useCiFixLoops.getState().apply(found);
        else useCiFixLoops.getState().forget(projectName);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [projectName, enabled]);
  return loop;
}
