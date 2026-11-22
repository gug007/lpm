import { useEffect, useState } from "react";
import { fixTabs, preferredFixOption, startFix } from "../ciFix";
import { commitHookPrompt, type HookFailure } from "../commitHook";

/** A commit a hook stopped, as it was asked for, so it can be tried again. */
export interface StoppedCommit {
  failure: HookFailure;
  message: string;
  files: string[];
  amend: boolean;
  andPush: boolean;
}

/** The commit dialog's hook failure: shown until the next try, a dismiss or the
 *  dialog closing, with the agent a Fix with … hands it to. */
export function useCommitHookFailure(open: boolean, projectName: string) {
  const [stopped, setStopped] = useState<StoppedCommit | null>(null);
  useEffect(() => {
    if (!open) setStopped(null);
  }, [open]);
  const fix = stopped ? preferredFixOption(fixTabs(projectName)) : null;
  const startFixing = () => {
    if (!stopped || !fix) return;
    startFix(projectName, fix, commitHookPrompt(stopped.failure, stopped));
    setStopped(null);
  };
  return { stopped, setStopped, clear: () => setStopped(null), fix, startFixing };
}
