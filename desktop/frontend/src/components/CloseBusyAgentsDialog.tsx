import { busyPlaceState, busyTitle } from "../busyPlaceState";
import type { CloseQuestion } from "../closeGuard";
import { chordLabel } from "../keys";
import { busyTotal } from "../updateBusyAgents";
import { BusyAgentPlaceList } from "./BusyAgentPlaceList";
import { ConfirmDialog } from "./ui/ConfirmDialog";

interface CloseBusyAgentsDialogProps {
  question: CloseQuestion | null;
  onCancel: () => void;
  onCloseNow: () => void;
  onCloseWhenDone: () => void;
  onKeepOpen: () => void;
}

const CLOSING = {
  tab: "Closing this tab",
  others: "Closing the other tabs",
  pane: "Closing this pane",
};

export function CloseBusyAgentsDialog({
  question,
  onCancel,
  onCloseNow,
  onCloseWhenDone,
  onKeepOpen,
}: CloseBusyAgentsDialogProps) {
  const total = question ? busyTotal(question.agents) : 0;
  const waiting = question?.keepOpen !== undefined;
  return (
    <ConfirmDialog
      open={question !== null}
      title={busyTitle(total)}
      secondaryLabel="Close now"
      onSecondary={onCloseNow}
      confirmLabel={waiting ? "Keep open" : "Close when done"}
      body={
        question && (
          <>
            {waiting && "It closes by itself when the agent is done. "}
            {CLOSING[question.what]} {waiting && "now "}ends {total === 1 ? "it" : "them"} mid-task:
            <BusyAgentPlaceList places={question.agents} detail={busyPlaceState} />
            {question.what === "tab" && (
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                {chordLabel({ key: "w", meta: true })} again closes it now.
              </p>
            )}
          </>
        )
      }
      onCancel={onCancel}
      onConfirm={waiting ? onKeepOpen : onCloseWhenDone}
    />
  );
}
