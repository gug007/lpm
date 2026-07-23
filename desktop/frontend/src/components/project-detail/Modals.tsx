import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ActionInputsModal } from "./ActionInputsModal";
import { ActionTerminal } from "./ActionTerminal";
import type { ProjectActionsModals } from "../../hooks/useProjectActions";

interface ModalsProps {
  projectName: string;
  actionModals: ProjectActionsModals;
}

export function Modals({ projectName, actionModals }: ModalsProps) {
  const { confirm, inputs, running } = actionModals;
  return (
    <>
      <ConfirmDialog
        open={confirm.action !== null}
        body={
          <>
            Run <span className="font-medium text-[var(--text-primary)]">{confirm.action?.label}</span>?
          </>
        }
        confirmLabel="Run"
        onCancel={confirm.onCancel}
        onConfirm={confirm.onConfirm}
      />

      {inputs.action && (
        <ActionInputsModal
          projectName={projectName}
          action={inputs.action}
          onCancel={inputs.onCancel}
          onSubmit={inputs.onSubmit}
        />
      )}

      {running.action && (
        <ActionTerminal label={running.action.label} onClose={running.onClose} />
      )}
    </>
  );
}
