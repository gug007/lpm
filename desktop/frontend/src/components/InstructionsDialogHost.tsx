import type { ComponentType } from "react";
import type { InstructionsTarget } from "../instructionSources";
import { useInstructionsDialog } from "../store/instructionsDialog";
import { BranchNameInstructionsEditor } from "./BranchNameInstructionsEditor";
import { CommitInstructionsEditor } from "./CommitInstructionsEditor";
import { PRInstructionsEditor } from "./PRInstructionsEditor";
import { ProjectBranchNameInstructionsEditor } from "./ProjectBranchNameInstructionsEditor";
import { ProjectCommitInstructionsEditor } from "./ProjectCommitInstructionsEditor";
import { ProjectPRInstructionsEditor } from "./ProjectPRInstructionsEditor";
import type { MachineScope } from "./settings/machineCommands";
import { useProjectMachine } from "./settings/useProjectMachine";
import { Modal } from "./ui/Modal";

type EditorProps = { onBack: () => void; backTitle: string };

const PROJECT_EDITORS: Record<InstructionsTarget, ComponentType<EditorProps & { projectName: string }>> = {
  commit: ProjectCommitInstructionsEditor,
  pr: ProjectPRInstructionsEditor,
  branch: ProjectBranchNameInstructionsEditor,
};

const GLOBAL_EDITORS: Record<InstructionsTarget, ComponentType<EditorProps & { machine: MachineScope }>> = {
  commit: CommitInstructionsEditor,
  pr: PRInstructionsEditor,
  branch: BranchNameInstructionsEditor,
};

// Mounted once: the instructions editor a git dialog's chip opens over itself.
export function InstructionsDialogHost() {
  const request = useInstructionsDialog((s) => s.request);
  const close = useInstructionsDialog((s) => s.close);
  const machine = useProjectMachine(request?.projectName ?? "");

  const ProjectEditor = request ? PROJECT_EDITORS[request.target] : null;
  const GlobalEditor = request ? GLOBAL_EDITORS[request.target] : null;

  return (
    <Modal
      open={request !== null}
      onClose={close}
      zIndexClassName="z-[70]"
      contentClassName="flex h-[min(600px,85vh)] w-[620px] max-w-[92vw] flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-5 pt-5 pb-3 text-[var(--text-primary)] shadow-2xl"
    >
      {request && request.scope === "project" && ProjectEditor && (
        <ProjectEditor projectName={request.projectName} onBack={close} backTitle={request.backTitle} />
      )}
      {request && request.scope === "global" && GlobalEditor && (
        <GlobalEditor machine={machine} onBack={close} backTitle={request.backTitle} />
      )}
    </Modal>
  );
}
