import type { ProjectInfo } from "../types";

/** The projects the sidebar list, its layout and the switcher know: all but an
 *  archived one that is open for now. */
export function listedProjects(projects: ProjectInfo[]): ProjectInfo[] {
  return projects.some((p) => p.archived) ? projects.filter((p) => !p.archived) : projects;
}
