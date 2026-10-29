import { displayNameForProjectName } from "./components/ProjectNameDisplay";
import { isPeerName } from "./peer/markers";
import { projectAgentRows } from "./sidebarAgents";
import { GLOBAL_TERMINALS_KEY } from "./terminals";
import type { ProjectInfo, StatusEntry } from "./types";

export interface BusyAgentPlace {
  key: string;
  name: string;
  count: number;
  /** How many of `count` are stopped on a question rather than working. */
  asking: number;
}

function busyCounts(entries: StatusEntry[] | undefined, now: number): { count: number; asking: number } {
  const states = projectAgentRows({ statusEntries: entries ?? [] }, now).map((row) => row.state);
  const asking = states.filter((state) => state === "needs-you").length;
  return { count: asking + states.filter((state) => state === "working").length, asking };
}

export function busyTotal(places: BusyAgentPlace[]): number {
  return places.reduce((sum, place) => sum + place.count, 0);
}

/** Where agents are mid-task — working, or stopped on a question — which the
 *  restart an update ends in would cut off. A paired machine's agents run there
 *  and carry on, so they don't count. */
export function busyAgentPlaces(
  projects: ProjectInfo[],
  terminalEntries: StatusEntry[],
  now = Date.now(),
): BusyAgentPlace[] {
  const places: BusyAgentPlace[] = [];
  const terminals = busyCounts(terminalEntries, now);
  if (terminals.count > 0) places.push({ key: GLOBAL_TERMINALS_KEY, name: "Terminals", ...terminals });
  for (const project of projects) {
    if (isPeerName(project.name)) continue;
    const counts = busyCounts(project.statusEntries, now);
    if (counts.count > 0) {
      places.push({
        key: project.name,
        name: displayNameForProjectName(project.name, projects),
        ...counts,
      });
    }
  }
  return places;
}
