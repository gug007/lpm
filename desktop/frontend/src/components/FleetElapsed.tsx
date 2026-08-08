import { fleetElapsedLabel, type FleetRow } from "../fleetRows";
import { useSecondsClock } from "../hooks/useSecondsClock";

export interface FleetElapsedProps {
  row: FleetRow;
}

export function FleetElapsed({ row }: FleetElapsedProps) {
  const now = useSecondsClock();
  return (
    <span className="w-24 shrink-0 whitespace-nowrap text-right text-[12px] tabular-nums text-[var(--text-muted)]">
      {fleetElapsedLabel(row, now)}
    </span>
  );
}
