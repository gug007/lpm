import { useState, type RefObject } from "react";
import { toast } from "sonner";
import { RunAction, RunActionBackground } from "../../wailsjs/go/main/App";
import type { TerminalViewHandle } from "../components/TerminalView";
import type { ActionInfo } from "../types";

export interface UseProjectActionsOptions {
  projectName: string;
  terminalViewRef: RefObject<TerminalViewHandle | null>;
  // Called before a "terminal"-type action runs so the UI is on the
  // terminal tab when the new pane appears.
  onSwitchToTerminal: () => void;
  // Called when the running-action modal closes; ProjectDetail uses it
  // to also dismiss the QuickPopover that may have triggered the action.
  onCloseRunning?: () => void;
}

export interface ActionModalConfig<T> {
  action: ActionInfo | null;
  onCancel: () => void;
  onConfirm: T;
}

export interface ProjectActionsModals {
  confirm: ActionModalConfig<() => void>;
  inputs: { action: ActionInfo | null; onCancel: () => void; onSubmit: (values: Record<string, string>) => void };
  running: { action: ActionInfo | null; onClose: () => void };
}

export interface UseProjectActionsResult {
  runningAction: ActionInfo | null;
  handleRunAction: (action: ActionInfo) => void;
  modals: ProjectActionsModals;
}

// Owns the action-execution state machine: routing through inputs and
// confirm modals when needed, then dispatching to the right runner
// (terminal pane / background / RPC). Modal state is exposed as a
// structured `modals` object so the consumer can render dialogs without
// reaching into individual setters.
export function useProjectActions({
  projectName,
  terminalViewRef,
  onSwitchToTerminal,
  onCloseRunning,
}: UseProjectActionsOptions): UseProjectActionsResult {
  const [runningAction, setRunningAction] = useState<ActionInfo | null>(null);
  const [confirmAction, setConfirmAction] = useState<ActionInfo | null>(null);
  const [inputsAction, setInputsAction] = useState<ActionInfo | null>(null);
  const [pendingInputValues, setPendingInputValues] = useState<Record<string, string> | null>(null);

  const executeAction = async (action: ActionInfo, inputValues: Record<string, string> = {}) => {
    setConfirmAction(null);
    setPendingInputValues(null);
    if (action.type === "terminal") {
      onSwitchToTerminal();
      try {
        // Route no-input terminals through the restore-aware RPC so the
        // backend can rewrite startCmd/resumeCmd; templated ones substitute
        // here and run ad-hoc.
        const actionName = action.reuse ? action.name : undefined;
        if (!action.inputs?.length) {
          await terminalViewRef.current?.createTerminalWithCmd(action.label, action.cmd, {
            configName: action.name,
            actionName,
          });
          return;
        }
        const cmd = Object.entries(inputValues).reduce(
          (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, v),
          action.cmd,
        );
        await terminalViewRef.current?.createTerminalWithCmd(action.label, cmd, {
          cwd: action.cwd,
          env: action.env,
          actionName,
        });
      } catch (err) {
        toast.error(`${action.label}: ${err}`);
      }
      return;
    }
    if (action.type === "background") {
      toast.promise(RunActionBackground(projectName, action.name, inputValues), {
        loading: `${action.label}…`,
        success: `${action.label} done`,
        error: (err) => `${action.label}: ${err}`,
      });
      return;
    }
    try {
      await RunAction(projectName, action.name, inputValues);
      setRunningAction(action);
    } catch (err) {
      toast.error(`${action.label}: ${err}`);
    }
  };

  const handleRunAction = (action: ActionInfo) => {
    if (action.inputs && action.inputs.length > 0) {
      setInputsAction(action);
      return;
    }
    if (action.confirm) {
      setConfirmAction(action);
      return;
    }
    executeAction(action);
  };

  const handleInputsSubmit = (values: Record<string, string>) => {
    const action = inputsAction;
    if (!action) return;
    setInputsAction(null);
    if (action.confirm) {
      setPendingInputValues(values);
      setConfirmAction(action);
      return;
    }
    executeAction(action, values);
  };

  return {
    runningAction,
    handleRunAction,
    modals: {
      confirm: {
        action: confirmAction,
        onCancel: () => {
          setConfirmAction(null);
          setPendingInputValues(null);
        },
        onConfirm: () => {
          if (confirmAction) executeAction(confirmAction, pendingInputValues ?? undefined);
        },
      },
      inputs: {
        action: inputsAction,
        onCancel: () => setInputsAction(null),
        onSubmit: handleInputsSubmit,
      },
      running: {
        action: runningAction,
        onClose: () => {
          setRunningAction(null);
          onCloseRunning?.();
        },
      },
    },
  };
}
