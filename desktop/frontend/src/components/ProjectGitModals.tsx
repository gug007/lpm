import { useState } from "react";
import { toast } from "../notifications/toast";
import { GitDiscardAll } from "../../bridge/commands";
import { DISCARD_KEPT_TEXT, announceDiscard } from "../gitDiscardUndo";
import { useGitStatus } from "../hooks/useGitStatus";
import { CommitModal } from "./CommitModal";
import { MergeBranchDialog } from "./MergeBranchDialog";
import { PRModal } from "./PRModal";
import { SwitchBranchModal } from "./SwitchBranchModal";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { CommitHistoryModal } from "./history/CommitHistoryModal";

export type GitModalKind = "commit" | "pr" | "switch" | "discard" | "merge" | "history";

export interface GitModalTarget {
  name: string;
  path: string;
  kind: GitModalKind;
}

interface ProjectGitModalsProps {
  target: GitModalTarget | null;
  onClose: () => void;
}

export function ProjectGitModals({ target, onClose }: ProjectGitModalsProps) {
  const path = target?.path ?? "";
  const name = target?.name ?? "";
  const gitState = useGitStatus(path);
  const currentBranch = gitState.status?.branch ?? "";
  const [discarding, setDiscarding] = useState(false);

  const discardAll = async () => {
    if (!path) return;
    setDiscarding(true);
    try {
      const kept = await GitDiscardAll(path);
      announceDiscard(path, kept, "Discarded all changes", gitState.refresh);
      gitState.refresh();
      onClose();
    } catch (err) {
      toast.error(`Discard failed: ${err}`);
    } finally {
      setDiscarding(false);
    }
  };

  return (
    <>
      <CommitModal
        open={target?.kind === "commit"}
        projectName={name}
        projectPath={path}
        onClose={onClose}
        onCommitted={gitState.refresh}
      />
      <PRModal
        open={target?.kind === "pr"}
        projectName={name}
        projectPath={path}
        currentBranch={currentBranch}
        onClose={onClose}
        onCreated={gitState.refresh}
      />
      <MergeBranchDialog
        open={target?.kind === "merge"}
        projectName={name}
        projectPath={path}
        currentBranch={currentBranch}
        branches={gitState.branches}
        onClose={onClose}
        onMerged={gitState.refresh}
      />
      <CommitHistoryModal
        open={target?.kind === "history"}
        projectPath={path}
        branch={currentBranch}
        onClose={onClose}
      />
      <SwitchBranchModal
        open={target?.kind === "switch"}
        projectPath={path}
        gitState={gitState}
        onClose={onClose}
      />
      <ConfirmDialog
        open={target?.kind === "discard"}
        title="Discard all changes"
        variant="destructive"
        confirmLabel="Discard all"
        disabled={discarding}
        body={
          <>
            Reset the working tree to HEAD, discarding every uncommitted change
            (staged, unstaged, and untracked). {DISCARD_KEPT_TEXT}
          </>
        }
        onCancel={onClose}
        onConfirm={discardAll}
      />
    </>
  );
}
