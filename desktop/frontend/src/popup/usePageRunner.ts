import { useCallback, useRef } from "react";
import { resolveRunnableAction } from "../actionTree";
import type { RunActionOpts } from "../hooks/useProjectActions";
import type { ActionInfo } from "../types";
import type { PageRunner } from "./pageRun";

// Runs one of the project's actions for a page, by name, as its button would.
export function usePageRunner(
  actions: ActionInfo[] | undefined,
  run: (action: ActionInfo, opts?: RunActionOpts) => void,
): PageRunner {
  const latest = useRef({ actions, run });
  latest.current = { actions, run };
  return useCallback(
    (name, inputs) =>
      new Promise((resolve) => {
        const action = resolveRunnableAction(latest.current.actions ?? [], name);
        if (!action) {
          resolve({ ok: false, error: `There's no action "${name}" in this project.` });
          return;
        }
        latest.current.run(action, { given: inputs, onDone: resolve });
      }),
    [],
  );
}
