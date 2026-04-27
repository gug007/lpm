import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ActionInputsModal } from "./ActionInputsModal";
import { ActionTerminal } from "./ActionTerminal";
import { TerminalSettingsModal } from "./TerminalSettingsModal";
import type { ProjectActionsModals } from "../../hooks/useProjectActions";
import type { TerminalThemeName } from "../../terminal-themes";

interface ModalsProps {
  projectName: string;
  actionModals: ProjectActionsModals;
  // Remove-project confirm
  confirmRemoveOpen: boolean;
  removeBusy: boolean;
  onCancelRemove: () => void;
  onConfirmRemove: () => Promise<void> | void;
  // Terminal settings
  terminalSettingsOpen: boolean;
  onCloseTerminalSettings: () => void;
  fontSize: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  terminalTheme: TerminalThemeName;
  onTerminalThemeChange: (theme: TerminalThemeName) => void;
}

// One place for every modal/dialog the project view can show. Bundling
// them keeps ProjectDetail's render path focused on layout and lets the
// individual dialog imports stay co-located with their state owners.
export function Modals({
  projectName,
  actionModals,
  confirmRemoveOpen,
  removeBusy,
  onCancelRemove,
  onConfirmRemove,
  terminalSettingsOpen,
  onCloseTerminalSettings,
  fontSize,
  onZoomIn,
  onZoomOut,
  terminalTheme,
  onTerminalThemeChange,
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

      <TerminalSettingsModal
        open={terminalSettingsOpen}
        onClose={onCloseTerminalSettings}
        fontSize={fontSize}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        terminalTheme={terminalTheme}
        onTerminalThemeChange={onTerminalThemeChange}
      />

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
