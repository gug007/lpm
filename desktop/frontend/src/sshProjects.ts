import type { ProjectInfo } from "./types";

// A file on an SSH project's host, reached through the project's folder there:
// the project's own by its relative path, any other by its absolute one.
export interface HostFile {
  root: string;
  rel: string;
}

// What an SSH project's host is called where a person reads it.
export function sshHostName(project: Pick<ProjectInfo, "sshHost">): string {
  return project.sshHost || "the server";
}
