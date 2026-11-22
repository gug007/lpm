import { fixTabs, preferredFixOption, startFix } from "./ciFix";
import { commitHookPrompt, hookHeadline, retryLabel, type HookFailure } from "./commitHook";
import { CommitHookOutput } from "./components/CommitHookOutput";
import { displayNameForProjectName } from "./components/ProjectNameDisplay";
import { toast } from "./notifications/toast";
import type { ToastId } from "./notifications/types";
import { useAppStore } from "./store/app";

/** Auto Commit's card when a hook stops the commit: what it found and printed,
 *  Fix with …, Try again with the same message, and Commit without hooks. */
export function showCommitHookToast(
  id: ToastId,
  run: { projectName: string; message: string; paths: string[]; failure: HookFailure },
  retry: (skipHooks: boolean) => void,
): void {
  const { projectName, message, paths, failure } = run;
  const fix = preferredFixOption(fixTabs(projectName));
  const again = { label: retryLabel(failure), onClick: () => retry(false) };
  const fixAction = fix
    ? {
        label: `Fix with ${fix.label}`,
        onClick: () => startFix(projectName, fix, commitHookPrompt(failure, { message, files: paths })),
      }
    : undefined;
  toast.error(hookHeadline(failure), {
    id,
    tag: displayNameForProjectName(projectName, useAppStore.getState().projects),
    description: failure.summary ?? undefined,
    content: <CommitHookOutput output={failure.output} />,
    action: fixAction ?? again,
    actions: [...(fixAction ? [again] : []), { label: "Commit without hooks", onClick: () => retry(true) }],
  });
}
