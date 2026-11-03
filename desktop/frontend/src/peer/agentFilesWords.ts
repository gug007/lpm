import { MACHINE as M } from "../machineWords";
import type { AgentFilesAccess, AgentFilesScope } from "./usePeerState";

interface Asked {
  id: string;
  machine: string;
  agent: string;
  project: string;
  tabGrant: boolean;
}

// A copy an agent asked for with `lpm cp`, waiting for a yes (agentapprove.rs).
export interface AgentCopyRequest extends Asked {
  kind: "copy";
  pulling: boolean;
  from: string;
  to: string;
  files: number;
  bytes: number;
  sensitive: string[];
  replaces: boolean;
}

// A command an agent asked to run with `lpm exec --on`, and the folder it
// starts in (`Studio:~/app`).
export interface AgentRunRequest extends Asked {
  kind: "run";
  command: string;
  cwd: string;
}

export type AgentFilesRequest = AgentCopyRequest | AgentRunRequest;

// Who asks, as the request's tab named it, said mid-sentence. A tab with no
// agent in it is "a command" asking to copy, but "a program" asking to run one.
export function askerLabel(req: { agent: string; project: string; kind?: AgentFilesRequest["kind"] }): string {
  if (req.agent && req.project) return `${req.agent} in ${req.project}`;
  if (req.agent) return req.agent;
  if (req.project) return `${req.kind === "run" ? "a program" : "a command"} in ${req.project}`;
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

// Whether a connected computer lets this one's agents run commands there.
export function runThereSummary(on: boolean): string {
  if (!on) return "Off. When on, agents here can run commands there with lpm exec --on, after you allow each one.";
  return "Agents here can run commands there, as your account on it. You allow each one first, or once for a tab.";
}

// Whether a paired computer's agents may run commands on this one.
export function runHereSummary(on: boolean): string {
  if (!on) return `Its agents can't run commands on ${M.thisMachine}.`;
  return `Its agents can run commands on ${M.thisMachine}, as you, once someone over there allows each one.`;
}
