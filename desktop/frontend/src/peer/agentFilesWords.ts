import { MACHINE as M } from "../machineWords";
import type { AgentFilesAccess, AgentFilesScope } from "./usePeerState";

// A copy an agent asked for with `lpm cp`, waiting for a yes (agentapprove.rs).
export interface AgentFilesRequest {
  id: string;
  machine: string;
  pulling: boolean;
  from: string;
  to: string;
  files: number;
  bytes: number;
  sensitive: string[];
  replaces: boolean;
  agent: string;
  project: string;
  tabGrant: boolean;
}

// Who asks, as the request's tab named it, said mid-sentence.
export function askerLabel(req: Pick<AgentFilesRequest, "agent" | "project">): string {
  if (req.agent && req.project) return `${req.agent} in ${req.project}`;
  if (req.agent) return req.agent;
  if (req.project) return `a command in ${req.project}`;
  return `a program outside lpm's terminals`;
}

export function access(value: string | null | undefined): AgentFilesAccess {
  return value === "read" || value === "write" ? value : "off";
}

export function scope(value: string | null | undefined): AgentFilesScope {
  return value === "home" ? "home" : "projects";
}

// What a connected computer lets this one's agents copy there.
export function thereSummary(a: AgentFilesAccess, s: AgentFilesScope): string {
  if (a === "off") return "Off. When on, agents here can copy files there with lpm cp, after you allow each copy.";
  const way = a === "read" ? "from it" : "to and from it";
  const place = s === "home" ? "its home folder and lpm projects" : "its lpm projects";
  return `Agents here can copy files ${way}, in ${place}. You allow each copy first.`;
}

// What a paired computer's agents may copy on this one.
export function hereSummary(a: AgentFilesAccess, s: AgentFilesScope): string {
  if (a === "off") return `Its agents can't copy files on ${M.thisMachine}.`;
  const way = a === "read" ? `from ${M.thisMachine}` : `to and from ${M.thisMachine}`;
  const place = s === "home" ? "your home folder and lpm projects" : "your lpm projects";
  return `Its agents can copy files ${way}, in ${place}.`;
}
