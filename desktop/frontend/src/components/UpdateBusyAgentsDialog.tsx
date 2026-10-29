import { busyTotal, type BusyAgentPlace } from "../updateBusyAgents";
import { BusyAgentPlaceList } from "./BusyAgentPlaceList";
import { ConfirmDialog } from "./ui/ConfirmDialog";

interface UpdateBusyAgentsDialogProps {
  places: BusyAgentPlace[] | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function UpdateBusyAgentsDialog({ places, onCancel, onConfirm }: UpdateBusyAgentsDialogProps) {
  const total = places ? busyTotal(places) : 0;
  return (
    <ConfirmDialog
      open={places !== null}
      title={total === 1 ? "An agent is still running" : "Agents are still running"}
      confirmLabel="Update anyway"
      body={
        <>
          Updating restarts lpm, which stops{" "}
          {total === 1 ? "this agent" : `these ${total} agents`} mid-task:
          <BusyAgentPlaceList
            places={places}
            detail={(place) => (place.count > 1 ? `${place.count} agents` : "")}
          />
        </>
      }
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
