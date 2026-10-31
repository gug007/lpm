import { crashSummary, projectUp } from "../serviceExit";
import type { ProjectInfo } from "../types";
import { StateGlyph } from "./StateGlyph";
import { StatusDot, dotKind } from "./StatusDot";

/** A project row's light: its services' state, or the error its config has. */
export function ProjectStatusLight({ project }: { project: ProjectInfo }) {
  if (project.configError) {
    return <StateGlyph state="error" title={`Config error: ${project.configError}`} />;
  }
  return <StatusDot running={projectUp(project)} crashed={crashSummary(project)} kind={dotKind(project)} />;
}
