import type { BusyAgentPlace } from "../updateBusyAgents";
import { ConfirmDialog } from "./ui/ConfirmDialog";

interface UpdateBusyAgentsDialogProps {
  places: BusyAgentPlace[] | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function UpdateBusyAgentsDialog({ places, onCancel, onConfirm }: UpdateBusyAgentsDialogProps) {
  const total = places?.reduce((sum, place) => sum + place.count, 0) ?? 0;
  return (
    <ConfirmDialog
      open={places !== null}
      title={total === 1 ? "An agent is still running" : "Agents are still running"}
      confirmLabel="Update anyway"
      body={
        <>
          Updating restarts lpm, which stops{" "}
          {total === 1 ? "this agent" : `these ${total} agents`} mid-task:
          <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto">
            {places?.map((place) => (
              <li key={place.key} className="flex items-baseline gap-2">
                <span className="min-w-0 truncate text-[var(--text-primary)]">{place.name}</span>
                {place.count > 1 && (
                  <span className="shrink-0 text-xs text-[var(--text-muted)]">
                    {place.count} agents
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      }
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
