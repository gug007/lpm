import { useMemo } from "react";
import { useSshHostName } from "../hooks/useSshRoot";
import type { HostFile } from "../sshProjects";

// The viewed file as its SSH host has it, and what that host is called; null
// for a file on this computer or a connected one. `root` is where the viewer
// reads it through, which is the project's folder only for a file on its host.
export function useHostFile(
  projectRoot: string,
  root: string,
  rel: string,
): { file: HostFile; name: string } | null {
  const name = useSshHostName(projectRoot);
  return useMemo(
    () => (name !== null && root === projectRoot ? { file: { root, rel }, name } : null),
    [name, projectRoot, root, rel],
  );
}
