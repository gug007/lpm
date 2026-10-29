import { busyTotal, type BusyAgentPlace } from "../updateBusyAgents";
import { BusyAgentPlaceList } from "./BusyAgentPlaceList";
import { ConfirmDialog } from "./ui/ConfirmDialog";

interface QuitBusyAgentsDialogProps {
  places: BusyAgentPlace[] | null;
  onCancel: () => void;
  onQuitNow: () => void;
  onQuitWhenDone: () => void;
}

function placeState(place: BusyAgentPlace): string {
  const working = place.count - place.asking;
  const parts: string[] = [];
  if (working > 0) parts.push(working === 1 ? "working" : `${working} working`);
  if (place.asking > 0) parts.push(place.asking === 1 ? "waiting for you" : `${place.asking} waiting for you`);
  return parts.join(", ");
}

export function QuitBusyAgentsDialog({ places, onCancel, onQuitNow, onQuitWhenDone }: QuitBusyAgentsDialogProps) {
  const total = places ? busyTotal(places) : 0;
  return (
    <ConfirmDialog
      open={places !== null}
      title={total === 1 ? "An agent is still working" : `${total} agents are still working`}
      secondaryLabel="Quit now"
      onSecondary={onQuitNow}
      confirmLabel="Quit when done"
      body={
        <>
          Quitting now ends {total === 1 ? "it" : "them"} mid-task:
          <BusyAgentPlaceList places={places} detail={placeState} />
        </>
      }
      onCancel={onCancel}
      onConfirm={onQuitWhenDone}
    />
  );
}
