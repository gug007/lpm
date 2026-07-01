import { useState, type RefObject } from "react";
import { toast } from "sonner";
import {
  CheckActionPortConflict,
  RunAction,
  RunActionBackground,
} from "../../bridge/commands";
import type { TerminalViewHandle } from "../components/TerminalView";
import type { ActionInfo } from "../types";
import { useAppStore } from "../store/app";

export interface UseProjectActionsOptions {
  projectName: string;
  terminalViewRef: RefObject<TerminalViewHandle | null>;
  onSwitchToTerminal: () => void;
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

export interface RunActionOpts {
  // Typed into the action's terminal once its program is ready (e.g. an
  // initial task for an AI agent the action launches).
  prompt?: string;
}

export interface UseProjectActionsResult {
  runningAction: ActionInfo | null;
  handleRunAction: (action: ActionInfo, opts?: RunActionOpts) => void;
  modals: ProjectActionsModals;
}

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

  const ensurePortFree = async (action: ActionInfo): Promise<boolean> => {
    if (!action.port?.length) return true;
    try {
      const conflicts = (await CheckActionPortConflict(projectName, action.name)) || [];
      if (conflicts.length === 0) return true;
      return await useAppStore
        .getState()
        .resolvePortConflicts(`Cannot run "${action.label}"`, conflicts);
    } catch (err) {
      toast.error(`Failed to run "${action.label}": ${err}`);
      return false;
    }
  };

  const executeAction = async (
    action: ActionInfo,
    inputValues: Record<string, string> = {},
    opts: RunActionOpts = {},
  ) => {
    setConfirmAction(null);
    setPendingInputValues(null);
    if (!(await ensurePortFree(action))) return;
    if (action.type === "terminal") {
      onSwitchToTerminal();
      try {
        // Route no-input terminals through the restore-aware RPC so the
        // backend can rewrite startCmd/resumeCmd; templated ones substitute
        // here and run ad-hoc.
        if (!action.inputs?.length) {
          await terminalViewRef.current?.createTerminalWithCmd(action.label, action.cmd, {
            configName: action.name,
            actionName: action.name,
            reuse: action.reuse,
            emoji: action.emoji,
            prompt: opts.prompt,
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
          actionName: action.name,
          reuse: action.reuse,
          emoji: action.emoji,
          prompt: opts.prompt,
        });
      } catch (err) {
        toast.error(`${action.label}: ${err}`);
      }
      return;
    }
    if (action.type === "command") {
      onSwitchToTerminal();
      const cmd = Object.entries(inputValues).reduce(
        (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, v),
        action.cmd,
      );
      terminalViewRef.current?.sendCommandToActive(cmd);
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

  const handleRunAction = (action: ActionInfo, opts?: RunActionOpts) => {
    if (action.inputs && action.inputs.length > 0) {
      setInputsAction(action);
      return;
    }
    if (action.confirm) {
      setConfirmAction(action);
      return;
    }
    executeAction(action, undefined, opts);
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
