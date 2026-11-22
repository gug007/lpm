import { TerminalTabOp } from "../bridge/commands";
import { toast } from "./notifications/toast";
import { isPeerName, peerSlugOf } from "./peer/markers";
import { useAppStore } from "./store/app";
import { listedProjects } from "./store/openedArchive";
import { showTab } from "./openLinks";
import { findParentProject, projectDisplayName, tabHomeName } from "./components/ProjectNameDisplay";
import { GLOBAL_TERMINALS_KEY, GLOBAL_TERMINALS_LABEL } from "./terminals";
import type { ProjectInfo } from "./types";

// "Move to ▸": a running tab handed to another project on the same computer.
// Its shell keeps running where it is; the tab, and its agent's status in the
// sidebar, now belong to the other project.

export interface MoveDestination {
  name: string;
  label: string;
}

// The projects a tab in `projectName` can move to: the others on its computer,
// and the standalone Terminals for a tab on this one. Projects on a remote host
// run their terminals there, so they neither give nor take tabs.
export function moveDestinations(projectName: string, projects: ProjectInfo[]): MoveDestination[] {
  const slug = peerSlugOf(projectName);
  const from = projects.find((p) => p.name === projectName);
  if (from?.isRemote) return [];
  const same = listedProjects(projects)
    .filter((p) => p.name !== projectName && !p.isRemote && (peerSlugOf(p.name) ?? null) === (slug ?? null))
    .map((p) => ({ name: p.name, label: projectDisplayName(p, findParentProject(p, projects)) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (slug || projectName === GLOBAL_TERMINALS_KEY) return same;
  return [...same, { name: GLOBAL_TERMINALS_KEY, label: GLOBAL_TERMINALS_LABEL }];
}

// The move keeps the shell where it is, which a new tab of the project wouldn't.
export function movedNote(projectName: string, dest: string): string {
  const { projects } = useAppStore.getState();
  const folder =
    projectName === GLOBAL_TERMINALS_KEY ? "the folder it started in" : `${tabHomeName(projectName, projects)}’s folder`;
  return `Moved to ${tabHomeName(dest, projects)}. It keeps running in ${folder}.`;
}

// A tab on this computer is moved by its own tab tree, which says so once it
// has; one on a connected computer is moved by that computer.
export function moveTab(projectName: string, id: string, dest: MoveDestination): void {
  if (isPeerName(projectName)) {
    void TerminalTabOp(projectName, "move", id, dest.name, null, null)
      .then(() => toast(movedNote(projectName, dest.name)))
      .catch((err) => toast.error(`Couldn't move the tab: ${String(err)}`));
  } else {
    useAppStore.getState().triggerRemoteTerminalOp(projectName, "move", id, dest.name, []);
  }
  showTab(dest.name, (tab) => tab.id === id);
}
