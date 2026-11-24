import type { BusyAgentPlace } from "./updateBusyAgents";

/** What a place's agents are doing: "working", "2 working, waiting for you". */
export function busyPlaceState(place: BusyAgentPlace): string {
  const working = place.count - place.asking;
  const parts: string[] = [];
  if (working > 0) parts.push(working === 1 ? "working" : `${working} working`);
  if (place.asking > 0) parts.push(place.asking === 1 ? "waiting for you" : `${place.asking} waiting for you`);
  return parts.join(", ");
}

export function busyTitle(total: number): string {
  return total === 1 ? "An agent is still working" : `${total} agents are still working`;
}
