import { useState } from "react";
import { toast } from "sonner";
import { GitDiscardAll } from "../../bridge/commands";
import { useGitStatus } from "../hooks/useGitStatus";
import { CommitModal } from "./CommitModal";
import { PRModal } from "./PRModal";
import { SwitchBranchModal } from "./SwitchBranchModal";
import { ConfirmDialog } from "./ui/ConfirmDialog";

export type GitModalKind = "commit" | "pr" | "switch" | "discard";

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
      await GitDiscardAll(path);
      toast.success("Discarded all changes");
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
            (staged, unstaged, and untracked). This cannot be undone.
          </>
        }
        onCancel={onClose}
        onConfirm={discardAll}
      />
    </>
  );
}
