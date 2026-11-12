import type { ReactNode } from "react";
import { crashLine } from "../serviceExit";
import type { ProjectInfo } from "../types";
import { workStatusNote } from "../workStatus";
import { SidebarWorkStatusLine } from "./SidebarWorkStatusLine";

/** The line under a project's sidebar row, or null for a one-line row: a
 *  crash, until it's restarted, outranks the note its work status carries. */
export function projectNoteLine(project: ProjectInfo): ReactNode | null {
  const crash = crashLine(project);
  if (crash !== null) return <span className="text-[var(--accent-red-text)]">{crash}</span>;
  const work = project.workStatus;
  const note = workStatusNote(work);
  return work && note !== null ? <SidebarWorkStatusLine status={work}>{note}</SidebarWorkStatusLine> : null;
}
