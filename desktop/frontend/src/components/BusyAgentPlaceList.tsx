import type { BusyAgentPlace } from "../updateBusyAgents";

interface BusyAgentPlaceListProps {
  places: BusyAgentPlace[] | null;
  detail: (place: BusyAgentPlace) => string;
}

export function BusyAgentPlaceList({ places, detail }: BusyAgentPlaceListProps) {
  return (
    <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto">
      {places?.map((place) => {
        const text = detail(place);
        return (
          <li key={place.key} className="flex items-baseline gap-2">
            <span className="min-w-0 truncate text-[var(--text-primary)]">{place.name}</span>
            {text && <span className="shrink-0 text-xs text-[var(--text-muted)]">{text}</span>}
          </li>
        );
      })}
    </ul>
  );
}
