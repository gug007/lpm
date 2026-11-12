import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ActionInputsModal } from "./ActionInputsModal";
import { ActionRunCard } from "./ActionRunCard";
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

      {running.shown && (
        <ActionRunCard
          key={running.shown.id}
          label={running.shown.action.label}
          runKey={running.shown.runKey}
          run={running.shown.run}
          startedAt={running.shown.startedAt}
          onClose={running.onClose}
          onRunAgain={running.onRunAgain}
          fix={{ projectName, cmd: running.shown.action.cmd }}
        />
      )}
    </>
  );
}
