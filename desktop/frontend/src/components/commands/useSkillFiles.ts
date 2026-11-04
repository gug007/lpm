import { useAppStore } from "../../store/app";
import { openFileViewer } from "../../store/fileViewer";
import { skillFileReach, type SkillFiles } from "./skillFile";

// The viewer rather than an app of this computer's, since a global skill sits
// outside the project and a paired computer's would only arrive as a copy.
export function useSkillFiles(projectName: string): SkillFiles {
  const onSsh = useAppStore((s) => s.projects.find((p) => p.name === projectName)?.isRemote ?? false);
  const projectRoot = useAppStore((s) => s.projects.find((p) => p.name === projectName)?.root ?? "");
  return {
    reachOf: (path, scope) => skillFileReach(path, scope, onSsh),
    open: (path) => openFileViewer({ absPath: path, line: 0, col: 0, projectRoot }),
  };
}
