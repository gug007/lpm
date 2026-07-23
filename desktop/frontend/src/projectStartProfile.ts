import type { ProjectInfo } from "./types";

type ProjectProfiles = Pick<ProjectInfo, "activeProfile" | "profiles">;

export function projectStartProfile(project: ProjectProfiles): string {
  return project.activeProfile || project.profiles[0]?.name || "";
}
