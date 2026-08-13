import type { AgentStatus } from "./agent-terminal";
import type { DemoJob } from "./automations";
import type { AiStatus, DemoProject } from "./projects";

export type ActivityState = "needs-you" | "error" | "working" | "done" | "idle";
export type ActivityKind = "agent" | "service" | "automation";

export type ActivityRow = {
  id: string;
  kind: ActivityKind;
  project: string;
  projectLabel: string;
  title: string;
  detail: string;
  state: ActivityState;
};

export const ACTIVITY_STATE_LABEL: Record<ActivityState, string> = {
  "needs-you": "Needs you",
  error: "Error",
  working: "Working",
  done: "Done",
  idle: "Idle",
};

export const ACTIVITY_STATE_STYLE: Record<ActivityState, { dot: string; text: string }> = {
  "needs-you": { dot: "bg-[#fbbf24]", text: "text-[#fbbf24]" },
  error: { dot: "bg-[#f87171]", text: "text-[#f87171]" },
  working: { dot: "bg-[#22d3ee]", text: "text-[#22d3ee]" },
  done: { dot: "bg-[#60a5fa]", text: "text-[#60a5fa]" },
  idle: { dot: "bg-[#6b6b6b]", text: "text-[#919191]" },
};

const STATE_ORDER: ActivityState[] = ["needs-you", "error", "working", "done", "idle"];

function agentState(status: AiStatus | AgentStatus): ActivityState {
  if (status === "running") return "working";
  if (status === "error") return "error";
  return "done";
}

export type ActivityInput = {
  projects: DemoProject[];
  runningByProject: Record<string, Set<string>>;
  aiStatusByProject: Record<string, AiStatus>;
  agentTabStatusByProject: Record<string, Record<string, AgentStatus>>;
  jobs: DemoJob[];
};

/** Everything the demo has running right now, in one list — agents first,
 *  then the services under them, then scheduled jobs. */
export function activityRows({
  projects,
  runningByProject,
  aiStatusByProject,
  agentTabStatusByProject,
  jobs,
}: ActivityInput): ActivityRow[] {
  const rows: ActivityRow[] = [];

  for (const project of projects) {
    const label = project.label ?? project.name;
    const tabs = agentTabStatusByProject[project.name] ?? {};
    const tabKeys = Object.keys(tabs);

    for (const key of tabKeys) {
      const action = project.actions.find((a) => a.name === key);
      rows.push({
        id: `agent:${project.name}:${key}`,
        kind: "agent",
        project: project.name,
        projectLabel: label,
        title: action?.label ?? key,
        detail: project.root,
        state: agentState(tabs[key]),
      });
    }

    // The sidebar's rollup covers agents in projects you haven't opened in this
    // session, where there are no live tabs to read a status off.
    const rollup = aiStatusByProject[project.name];
    if (rollup && tabKeys.length === 0) {
      const agentAction = project.actions.find((a) => a.agent);
      rows.push({
        id: `agent:${project.name}`,
        kind: "agent",
        project: project.name,
        projectLabel: label,
        title: agentAction?.label ?? "Agent",
        detail: project.root,
        state: agentState(rollup),
      });
    }

    for (const service of project.services) {
      if (!runningByProject[project.name]?.has(service.name)) continue;
      rows.push({
        id: `service:${project.name}:${service.name}`,
        kind: "service",
        project: project.name,
        projectLabel: label,
        title: service.name,
        detail: service.port ? `port ${service.port}` : service.cmd,
        state: "working",
      });
    }
  }

  for (const job of jobs) {
    if (!job.running && job.unread === 0) continue;
    rows.push({
      id: `job:${job.id}`,
      kind: "automation",
      project: "",
      projectLabel: job.scope,
      title: job.label,
      detail: job.running
        ? "running now"
        : `${job.unread} new ${job.unread === 1 ? "message" : "messages"}`,
      state: job.running ? "working" : "done",
    });
  }

  return rows.sort(
    (a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state),
  );
}

export function countsByState(rows: ActivityRow[]): Record<ActivityState, number> {
  const counts: Record<ActivityState, number> = {
    "needs-you": 0,
    error: 0,
    working: 0,
    done: 0,
    idle: 0,
  };
  for (const row of rows) counts[row.state] += 1;
  return counts;
}
