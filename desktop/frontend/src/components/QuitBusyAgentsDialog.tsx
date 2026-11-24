import { busyPlaceState, busyTitle } from "../busyPlaceState";
import { busyTotal, type BusyAgentPlace } from "../updateBusyAgents";
import { BusyAgentPlaceList } from "./BusyAgentPlaceList";
import { ConfirmDialog } from "./ui/ConfirmDialog";

interface QuitBusyAgentsDialogProps {
  places: BusyAgentPlace[] | null;
  onCancel: () => void;
  onQuitNow: () => void;
  onQuitWhenDone: () => void;
}

export function QuitBusyAgentsDialog({ places, onCancel, onQuitNow, onQuitWhenDone }: QuitBusyAgentsDialogProps) {
  const total = places ? busyTotal(places) : 0;
  return (
    <ConfirmDialog
      open={places !== null}
      title={busyTitle(total)}
      secondaryLabel="Quit now"
      onSecondary={onQuitNow}
      confirmLabel="Quit when done"
      body={
        <>
          Quitting now ends {total === 1 ? "it" : "them"} mid-task:
          <BusyAgentPlaceList places={places} detail={busyPlaceState} />
        </>
      }
      onCancel={onCancel}
      onConfirm={onQuitWhenDone}
    />
  );
}
