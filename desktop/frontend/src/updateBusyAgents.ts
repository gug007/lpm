import { displayNameForProjectName } from "./components/ProjectNameDisplay";
import { isPeerName } from "./peer/markers";
import { projectAgentRows } from "./sidebarAgents";
import { GLOBAL_TERMINALS_KEY } from "./terminals";
import type { ProjectInfo, StatusEntry } from "./types";

export interface BusyAgentPlace {
  key: string;
  name: string;
  count: number;
}

function busyCount(entries: StatusEntry[] | undefined, now: number): number {
  return projectAgentRows({ statusEntries: entries ?? [] }, now).filter(
    (row) => row.state === "working" || row.state === "needs-you",
  ).length;
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
  const terminals = busyCount(terminalEntries, now);
  if (terminals > 0) places.push({ key: GLOBAL_TERMINALS_KEY, name: "Terminals", count: terminals });
  for (const project of projects) {
    if (isPeerName(project.name)) continue;
    const count = busyCount(project.statusEntries, now);
    if (count > 0) {
      places.push({
        key: project.name,
        name: displayNameForProjectName(project.name, projects),
        count,
      });
    }
  }
  return places;
}
