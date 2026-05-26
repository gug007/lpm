import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ActionInputsModal } from "./ActionInputsModal";
import { ActionTerminal } from "./ActionTerminal";
import type { ProjectActionsModals } from "../../hooks/useProjectActions";

interface ModalsProps {
  projectName: string;
  actionModals: ProjectActionsModals;
  confirmRemoveOpen: boolean;
  removeBusy: boolean;
  onCancelRemove: () => void;
  onConfirmRemove: () => Promise<void> | void;
}

export function Modals({
  projectName,
  actionModals,
  confirmRemoveOpen,
  removeBusy,
  onCancelRemove,
  onConfirmRemove,
}: ModalsProps) {
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
          action={inputs.action}
          onCancel={inputs.onCancel}
          onSubmit={inputs.onSubmit}
        />
      )}

      {running.action && (
        <ActionTerminal label={running.action.label} onClose={running.onClose} />
      )}

      <ConfirmDialog
        open={confirmRemoveOpen}
        title="Remove project"
        body={
          <>
            Are you sure you want to remove{" "}
            <span className="font-medium text-[var(--text-primary)]">{projectName}</span>
            ? This will delete the config file and stop any running session.
          </>
        }
        confirmLabel="Remove"
        variant="destructive"
        disabled={removeBusy}
        onCancel={onCancelRemove}
        onConfirm={onConfirmRemove}
      />
    </>
  );
}
