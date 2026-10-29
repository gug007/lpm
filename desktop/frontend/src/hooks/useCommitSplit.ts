import { useState } from "react";
import { GenerateCommitSplit, GitCommit, GitMergeState, GitPush } from "../../bridge/commands";
import { commitGroups, type CommitGroup } from "../commitSplit";
import { count } from "../count";
import { DEFAULT_PUSH_CONFIG, pushFlags } from "../gitOptions";
import { toast } from "../notifications/toast";
import { getSettings } from "../store/settings";
import { aiEffectiveFast } from "../types";
import { isCanceledError, type AIGeneration } from "./useAIGeneration";
import type { AIPicker } from "./useAIPicker";

export interface CommitSplit {
  groups: CommitGroup[] | null;
  busy: false | "commit" | "push";
  setGroups: (groups: CommitGroup[] | null) => void;
  /** Asks the AI for a split of `files`. One group comes back as a message
   *  for the plain commit instead. */
  plan: (files: string[], task: string, onSingle: (message: string) => void) => Promise<void>;
  /** Commits every group in order. True once all of them landed. */
  commitAll: (andPush: boolean) => Promise<boolean>;
}

export function useCommitSplit(
  projectName: string,
  projectPath: string,
  gen: AIGeneration,
  ai: AIPicker,
): CommitSplit {
  const [groups, setGroups] = useState<CommitGroup[] | null>(null);
  const [busy, setBusy] = useState<false | "commit" | "push">(false);

  const plan: CommitSplit["plan"] = async (files, task, onSingle) => {
    const merge = await GitMergeState(projectPath).catch(() => null);
    if (merge?.merging) {
      toast.error("Finish the merge first. A merge commit can't be split.");
      return;
    }
    try {
      const planned = ((await gen.run((genId) =>
        GenerateCommitSplit(
          projectName,
          projectPath,
          ai.selectedCLI,
          ai.selectedModel,
          ai.selectedEffort,
          aiEffectiveFast(ai.selectedCLI, ai.selectedModel, ai.selectedFast),
          files,
          task,
          genId,
        ),
      )) ?? []) as CommitGroup[];
      if (planned.length === 1) {
        onSingle(planned[0].message);
        toast("These changes read as one commit, so the message is filled in.");
      } else if (planned.length > 1) {
        setGroups(planned);
      }
    } catch (err) {
      if (!isCanceledError(err)) toast.error(`Couldn't split the changes: ${String(err)}`);
    }
  };

  const commitAll: CommitSplit["commitAll"] = async (andPush) => {
    if (!groups || busy) return false;
    setBusy("commit");
    try {
      const total = groups.length;
      const result = await commitGroups(groups, (message, files) => GitCommit(projectPath, message, files));
      if (result.error !== undefined) {
        setGroups(groups.slice(result.done));
        toast.error(
          result.done > 0
            ? `Committed ${result.done} of ${total}. The next commit failed: ${result.error}`
            : `Commit failed: ${result.error}`,
        );
        return false;
      }
      if (!andPush) {
        toast.success(`Committed ${count(total, "commit", "commits")}`);
        return true;
      }
      setBusy("push");
      try {
        await GitPush(projectPath, pushFlags(getSettings().gitPush ?? DEFAULT_PUSH_CONFIG));
        toast.success(`Committed ${count(total, "commit", "commits")} and pushed`);
      } catch (err) {
        toast.error(`Committed ${count(total, "commit", "commits")}, but the push failed: ${String(err)}`);
      }
      return true;
    } finally {
      setBusy(false);
    }
  };

  return { groups, busy, setGroups, plan, commitAll };
}
