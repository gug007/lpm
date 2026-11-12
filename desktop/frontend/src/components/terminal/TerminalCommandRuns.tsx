import { useCallback, useEffect, useRef, useState } from "react";
import { RunCommand, StopCommand } from "../../../bridge/commands";
import { toast } from "../../notifications/toast";
import { captureActionRun, type ActionRunCapture } from "../../hooks/actionRunCapture";
import { findTerminalLocation, type PaneNode } from "../../paneTree";
import { takeCommandRun, useCommandChip, type CommandChipTarget } from "../../store/commandChip";
import { ActionRunCard } from "../project-detail/ActionRunCard";
import { placeInCorner } from "../project-detail/runCardPlacement";
import { CommandChip } from "./CommandChip";

interface ShownRun {
  id: string;
  command: string;
  terminalId: string;
  run: ActionRunCapture;
  startedAt: number;
}

interface TerminalCommandRunsProps {
  projectName: string;
  tree: PaneNode | null;
  onRunInNewTab: (paneId: string, command: string) => void;
}

function terminalArea(terminalId: string): DOMRect | null {
  for (const el of document.querySelectorAll(`[data-terminal-id="${CSS.escape(terminalId)}"]`)) {
    if (el.getClientRects().length > 0) return el.getBoundingClientRect();
  }
  return null;
}

const running = (shown: ShownRun | null) => !!shown && shown.run.snapshot().done === null;

// The Run chip for this view's terminals and the card a run's output shows in,
// in the top right corner of the terminal it came from. One run at a time:
// starting another stops the one still going, since its card is the only
// thing showing it.
export function TerminalCommandRuns({ projectName, tree, onRunInNewTab }: TerminalCommandRunsProps) {
  const chip = useCommandChip((s) => s.chip);
  const request = useCommandChip((s) => s.request);
  const [shown, setShown] = useState<ShownRun | null>(null);
  const shownRef = useRef<ShownRun | null>(null);
  shownRef.current = shown;

  const owns = useCallback((terminalId: string) => !!tree && findTerminalLocation(tree, terminalId) !== null, [tree]);

  const stop = useCallback(
    (run: ShownRun) => void StopCommand(projectName, run.id).catch(() => {}),
    [projectName],
  );

  const close = useCallback(
    (run: ShownRun | null) => {
      if (!run) return;
      if (running(run)) stop(run);
      run.run.dispose();
    },
    [stop],
  );

  const start = useCallback(
    async (terminalId: string, command: string) => {
      close(shownRef.current);
      setShown(null);
      const id = crypto.randomUUID();
      const startedAt = Date.now();
      let capture: ActionRunCapture | null = null;
      try {
        capture = await captureActionRun(id);
        await RunCommand(projectName, command, id);
        setShown({ id, command, terminalId, run: capture, startedAt });
      } catch (err) {
        capture?.dispose();
        toast.error(`Couldn't run ${command}: ${String(err)}`);
      }
    },
    [projectName, close],
  );

  const runInNewTab = useCallback(
    (terminalId: string, command: string) => {
      const at = tree && findTerminalLocation(tree, terminalId);
      if (at) onRunInNewTab(at.paneId, command);
    },
    [tree, onRunInNewTab],
  );

  useEffect(() => {
    if (!request || !owns(request.terminalId)) return;
    takeCommandRun(request.nonce);
    void start(request.terminalId, request.command);
  }, [request, owns, start]);

  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => () => closeRef.current(shownRef.current), []);

  return (
    <>
      {chip && owns(chip.terminalId) && (
        <CommandChip
          // A ⌘-click on a risky command whose chip is already up opens it asking.
          key={`${chip.key}:${chip.armed}`}
          target={chip}
          onRun={(t: CommandChipTarget) => void start(t.terminalId, t.command)}
          onRunInNewTab={(t: CommandChipTarget) => runInNewTab(t.terminalId, t.command)}
        />
      )}
      {shown && (
        <ActionRunCard
          key={shown.id}
          label={shown.command}
          place={(view) => placeInCorner(terminalArea(shown.terminalId), view)}
          run={shown.run}
          startedAt={shown.startedAt}
          onClose={() => {
            close(shown);
            setShown(null);
          }}
          onRunAgain={() => void start(shown.terminalId, shown.command)}
          onStop={() => stop(shown)}
          large
          fix={{ projectName, cmd: shown.command }}
        />
      )}
    </>
  );
}
