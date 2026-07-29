import type { ProjectInfo } from "./types";
import { projectDisplayName } from "./components/ProjectNameDisplay";

/** `name` is the routing key every command takes, `label` the only thing safe
 *  to show. An empty `name` means the row belongs to no single project. */
export interface FleetProjectIdentity {
  name: string;
  label: string;
  isCopy: boolean;
  isWorktree: boolean;
  isRemote: boolean;
  peerAlias: string | null;
}

export function fleetIdentityOf(
  project: ProjectInfo,
  parent: ProjectInfo | undefined,
  peerAlias: string | null,
): FleetProjectIdentity {
  return {
    name: project.name,
    label: projectDisplayName(project, parent),
    isCopy: !!project.parentName && project.worktree !== true,
    isWorktree: project.worktree === true,
    isRemote: project.isRemote === true,
    peerAlias,
  };
}

/** A row that belongs to no single project: `label` stands for the set instead. */
export function namelessIdentity(label: string): FleetProjectIdentity {
  return {
    name: "",
    label,
    isCopy: false,
    isWorktree: false,
    isRemote: false,
    peerAlias: null,
  };
}

/** Exactly one surface shows these per layout — the row when the list is flat,
 *  the section header when it is grouped. */
export function fleetIdentityTags(project: FleetProjectIdentity): string[] {
  if (!project.name) return [];
  return [
    project.isCopy ? "Copy" : null,
    project.isWorktree ? "Worktree" : null,
    project.isRemote ? "SSH" : null,
    project.peerAlias,
  ].filter((tag): tag is string => tag !== null);
}
