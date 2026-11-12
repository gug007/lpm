import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { toast } from "../notifications/toast";
import {
  CancelActionBackground,
  CheckActionPortConflict,
  RunAction,
  RunActionBackground,
} from "../../bridge/commands";
import type { TerminalViewHandle } from "../components/TerminalView";
import type { ActionInfo } from "../types";
import { substituteText } from "../components/project-detail/actionInputs";
import { substituteCommand } from "../components/project-detail/commandInputs";
import { promptTextToSeed } from "../composerValue";
import { useAppStore } from "../store/app";
import {
  showBackgroundRunToast,
  type BackgroundRunStatus,
} from "../components/BackgroundRunToast";
import { trackBackgroundRun } from "../store/backgroundRuns";
import type { ModelPick } from "../agentModelSwitch";
import { captureActionRun, type ActionRunCapture } from "./actionRunCapture";
import { actionRunKey, clearActionRun, markActionRun, setActionRunReopen } from "../store/actionRunMarks";
import { runState } from "../components/project-detail/runCardPlacement";

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

// A quick action's run, shown in its result card until closed.
export interface ShownRun {
  id: string;
  action: ActionInfo;
  run: ActionRunCapture;
  startedAt: number;
  runKey: string;
}

export interface ProjectActionsModals {
  confirm: ActionModalConfig<() => void>;
  inputs: { action: ActionInfo | null; onCancel: () => void; onSubmit: (values: Record<string, string>) => void };
  running: { shown: ShownRun | null; onClose: () => void; onRunAgain: () => void };
}

export interface RunActionOpts {
  // Submitted into the action's terminal once its program is ready (e.g. an
  // initial task for an AI agent the action launches). A string is a text
  // prompt; an array is ordered paste parts (text runs and image paths).
  prompt?: string | string[];
  // A mobile client already ran the inputs + confirm gauntlet on the phone and
  // relayed the collected values, so run directly without re-prompting here.
  inputValues?: Record<string, string>;
  skipPrompts?: boolean;
  // Starts the agent the action launches on this model and level.
  launchModel?: ModelPick;
  // A scheduled job's run: stays on the project's fixed Claude account.
  fixedAccount?: boolean;
  // Run for someone else (a phone): its tab opens behind the one in view.
  background?: boolean;
  // Opens its terminal in this pane rather than the focused one.
  paneId?: string;
}

export interface UseProjectActionsResult {
  // The quick action still running, if any. Its card can stay up after it ends.
  runningAction: ActionInfo | null;
  handleRunAction: (action: ActionInfo, opts?: RunActionOpts) => void;
  modals: ProjectActionsModals;
}

const noSubscribe = () => () => {};

function failedRun(shown: ShownRun): boolean {
  return runState(shown.run.snapshot().done) === "failed";
}

// An ended run's output as it stands, without the listeners that captured it.
function frozenRun(run: ActionRunCapture): ActionRunCapture {
  const snap = run.snapshot();
  run.dispose();
  return { snapshot: () => snap, subscribe: noSubscribe, dispose: () => {} };
}

export function useProjectActions({
  projectName,
  terminalViewRef,
  onSwitchToTerminal,
  onCloseRunning,
}: UseProjectActionsOptions): UseProjectActionsResult {
  const [shown, setShown] = useState<ShownRun | null>(null);
  const shownRef = useRef<ShownRun | null>(null);
  shownRef.current = shown;
  const captureRef = useRef<ActionRunCapture | null>(null);
  // Failed runs whose cards were closed, by run key, so their buttons' marks
  // can bring the output back until the action runs again.
  const keptRef = useRef(new Map<string, ShownRun>());
  const [confirmAction, setConfirmAction] = useState<ActionInfo | null>(null);
  const [inputsAction, setInputsAction] = useState<ActionInfo | null>(null);
  const [pendingInputValues, setPendingInputValues] = useState<Record<string, string> | null>(null);
  // What the run was asked with (its prompt above all), kept while its inputs
  // or confirmation are up.
  const pendingOptsRef = useRef<RunActionOpts>({});

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const kept = keptRef.current;
    return () => {
      mountedRef.current = false;
      captureRef.current?.dispose();
      captureRef.current = null;
      for (const runKey of kept.keys()) setActionRunReopen(runKey, undefined);
      kept.clear();
    };
  }, []);

  // Actions stay disabled while a run is going, not for as long as its card is
  // up, and the button keeps how the run ended once the card has closed.
  const done = useSyncExternalStore(
    shown ? shown.run.subscribe : noSubscribe,
    () => shown?.run.snapshot().done ?? null,
  );
  useEffect(() => {
    if (shown && done) markActionRun(shown.runKey, done.success, shown.run.snapshot().endedAt);
  }, [shown, done]);

  // A run that resolves after the view is gone has no card to feed.
  const showRun = (next: ShownRun | null) => {
    captureRef.current?.dispose();
    captureRef.current = null;
    if (!mountedRef.current) {
      next?.run.dispose();
      return;
    }
    captureRef.current = next?.run ?? null;
    setShown(next);
  };

  const forgetKept = (runKey: string) => {
    if (keptRef.current.delete(runKey)) setActionRunReopen(runKey, undefined);
  };

  // The card on screen is going away: a failure is kept for its mark to reopen.
  const putAwayShown = () => {
    const current = shownRef.current;
    if (!current || !failedRun(current) || captureRef.current !== current.run) return;
    captureRef.current = null;
    keptRef.current.set(current.runKey, { ...current, run: frozenRun(current.run) });
    setActionRunReopen(current.runKey, () => reopenKept(current.runKey));
  };

  const reopenKept = (runKey: string) => {
    const kept = keptRef.current.get(runKey);
    if (!kept) return;
    forgetKept(runKey);
    putAwayShown();
    showRun(kept);
  };

  const ensurePortFree = async (action: ActionInfo): Promise<boolean> => {
    if (!action.port?.length) return true;
    try {
      const conflicts = (await CheckActionPortConflict(projectName, action.name)) || [];
      if (conflicts.length === 0) return true;
      return await useAppStore
        .getState()
        .resolvePortConflicts(`Cannot run "${action.label}"`, conflicts, projectName);
    } catch (err) {
      toast.error(`Failed to run "${action.label}": ${err}`);
      return false;
    }
  };

  // A caller-supplied prompt (a duplicate's seeded task, a mobile run) wins
  // over the prompt saved on the action itself; input placeholders substitute
  // into the saved prompt the same way they do into cmd.
  const actionPrompt = (
    action: ActionInfo,
    inputValues: Record<string, string>,
    opts: RunActionOpts,
  ): string | string[] | undefined => {
    if (opts.prompt !== undefined) return opts.prompt;
    if (!action.prompt?.trim()) return undefined;
    return promptTextToSeed(substituteText(action.prompt, inputValues));
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
            color: action.color,
            prompt: actionPrompt(action, inputValues, opts),
            launchModel: opts.launchModel,
            fixedAccount: opts.fixedAccount,
            background: opts.background,
            paneId: opts.paneId,
          });
          return;
        }
        const cmd = substituteCommand(action.cmd, inputValues);
        const env = action.env
          ? Object.fromEntries(
              Object.entries(action.env).map(([k, v]) => [
                k,
                substituteText(v, inputValues),
              ]),
            )
          : undefined;
        await terminalViewRef.current?.createTerminalWithCmd(action.label, cmd, {
          cwd: action.cwd && substituteText(action.cwd, inputValues),
          env,
          actionName: action.name,
          reuse: action.reuse,
          emoji: action.emoji,
          color: action.color,
          prompt: actionPrompt(action, inputValues, opts),
          launchModel: opts.launchModel,
          fixedAccount: opts.fixedAccount,
          background: opts.background,
          paneId: opts.paneId,
        });
      } catch (err) {
        toast.error(`${action.label}: ${err}`);
      }
      return;
    }
    if (action.type === "command") {
      onSwitchToTerminal();
      terminalViewRef.current?.sendCommandToActive(
        substituteCommand(action.cmd, inputValues),
      );
      return;
    }
    if (action.type === "background") {
      const runId = crypto.randomUUID();
      const startedAt = Date.now();
      trackBackgroundRun(runId);
      const show = (status: BackgroundRunStatus, error?: string) =>
        showBackgroundRunToast({
          runId,
          label: action.label,
          status,
          startedAt,
          error,
          onCancel: () => void CancelActionBackground(runId).catch(() => {}),
        });
      show("running");
      try {
        await RunActionBackground(projectName, action.name, inputValues, runId);
        show("success");
      } catch (err) {
        if (String(err) === "cancelled") show("cancelled");
        else show("error", String(err));
      }
      return;
    }
    let capture: ActionRunCapture | null = null;
    const runKey = actionRunKey(projectName, action.name);
    clearActionRun(runKey);
    try {
      const runId = crypto.randomUUID();
      const startedAt = Date.now();
      capture = await captureActionRun(runId);
      await RunAction(projectName, action.name, inputValues, runId);
      putAwayShown();
      forgetKept(runKey);
      showRun({ id: runId, action, run: capture, startedAt, runKey });
    } catch (err) {
      capture?.dispose();
      toast.error(`${action.label}: ${err}`);
    }
  };

  const handleRunAction = (action: ActionInfo, opts?: RunActionOpts) => {
    if (opts?.skipPrompts) {
      // Mobile already collected inputs + confirmed; run straight through.
      executeAction(action, opts.inputValues ?? {}, opts);
      return;
    }
    pendingOptsRef.current = opts ?? {};
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
    executeAction(action, values, pendingOptsRef.current);
  };

  return {
    runningAction: shown && !done ? shown.action : null,
    handleRunAction,
    modals: {
      confirm: {
        action: confirmAction,
        onCancel: () => {
          setConfirmAction(null);
          setPendingInputValues(null);
        },
        onConfirm: () => {
          if (confirmAction) executeAction(confirmAction, pendingInputValues ?? undefined, pendingOptsRef.current);
        },
      },
      inputs: {
        action: inputsAction,
        onCancel: () => setInputsAction(null),
        onSubmit: handleInputsSubmit,
      },
      running: {
        shown,
        onClose: () => {
          putAwayShown();
          showRun(null);
          onCloseRunning?.();
        },
        onRunAgain: () => {
          if (shown) handleRunAction(shown.action);
        },
      },
    },
  };
}
