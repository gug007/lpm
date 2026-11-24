import { sshHostName } from "../sshProjects";
import { useAppStore } from "../store/app";

// An SSH project's folder on its host; empty for any other project.
export function useSshRoot(projectName: string): string {
  return useAppStore((s) => s.projects.find((p) => p.name === projectName && p.isRemote)?.root ?? "");
}

// What the host of the SSH project in this folder is called; null for any other
// project's folder.
export function useSshHostName(root: string): string | null {
  return useAppStore((s) => {
    const project = s.projects.find((p) => p.isRemote && p.root === root);
    return project ? sshHostName(project) : null;
  });
}
