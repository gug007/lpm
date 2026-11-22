import { projectAgentRows, sidebarProjectAlert } from "../sidebarAgents";
import type { RowBuiltIns, RowData } from "../sidebarRowDetails";
import type { ProjectInfo } from "../types";
import { projectNoteLine } from "./projectNoteLine";
import { SidebarAgentSummary } from "./SidebarAgentSummary";
import { SidebarOriginMark } from "./SidebarOriginMark";
import type { RowBuiltInNodes } from "./SidebarRowDetail";

export interface RowSampleBuiltIns {
  flags: RowBuiltIns;
  nodes: RowBuiltInNodes;
  // The project has agents, so its row keeps room for their arrow at the end.
  agents: boolean;
}

// The project whose row the Row builder draws, with what its details read.
export interface RowSample {
  project?: ProjectInfo;
  name: string;
  data: RowData;
  builtIns: RowSampleBuiltIns;
}

// What the sidebar draws for a project's agent word, status note and origin
// mark, for the Row builder's copy of that project's row.
export function rowSampleBuiltIns(project: ProjectInfo | undefined): RowSampleBuiltIns {
  if (!project) return { flags: { alert: false, status: false, origin: false }, nodes: {}, agents: false };
  const agents = projectAgentRows(project, Date.now());
  const alert = sidebarProjectAlert(agents);
  const note = projectNoteLine(project);
  const origin = !project.isRemote && !project.configError;
  return {
    agents: agents.length > 0,
    flags: { alert: alert !== null, status: note !== null, origin },
    nodes: {
      alert: alert && <SidebarAgentSummary agent={alert} />,
      status: note,
      origin: origin ? <SidebarOriginMark root={project.root} /> : undefined,
    },
  };
}
