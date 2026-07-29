import type { ProjectInfo, StatusEntry } from "./types";
import {
  AGENT_STATE_RANK,
  agentStateOf,
  providerMeta,
  statusProvider,
  type AgentState,
} from "./agentStatus";
import { applyFleetFilter, type FleetFilter } from "./fleetFilter";
import {
  fleetIdentityOf,
  namelessIdentity,
  type FleetProjectIdentity,
} from "./fleetIdentity";
import {
  formatDuration,
  jobTargets,
  MULTI_PROJECT_LABEL,
  STANDALONE_PROJECT_LABEL,
  type JobInfo,
} from "./jobsFormat";
import { peerSlugOf } from "./peer/markers";

export type FleetRowKind = "agent" | "automation";

export interface FleetRow {
  id: string;
  kind: FleetRowKind;
  project: FleetProjectIdentity;
  title: string;
  /** What the terminal tab is called — the agent's session title once it names
   *  one. Null when the tab has no name of its own beyond the agent. */
  tabTitle: string | null;
  state: AgentState;
  statusKey: string | null;
  statusValue: string | null;
  terminalId: string | null;
  jobId: string | null;
  /** Millis: when the row entered the state it is in. */
  stateSince: number;
  detail: string | null;
  dismissable: boolean;
  /** Why it cannot be dismissed, ready to show; null when it can. */
  dismissBlocked: string | null;
}

export interface FleetServiceGroup {
  project: FleetProjectIdentity;
  running: string[];
  declared: string[];
  /** The port each service declares, when it declares one. Live detection wins
   *  over this, but it lets a link render before detection comes back. */
  ports: Record<string, number>;
}

export interface FleetCounts {
  needsYou: number;
  error: number;
  working: number;
  done: number;
}

/** `ListAllJobs()` rows: JobInfo plus the owning project the backend stamps on. */
export type FleetJob = JobInfo & { project?: string };

export interface FleetSnapshot {
  projects: ProjectInfo[];
  /** Local jobs only — see `peerAutomationsHidden`. */
  jobs: FleetJob[];
  /** Millis. */
  now: number;
  filter: FleetFilter;
  /** Paired-Mac slug to the name the user knows it by. */
  peerAliases: Record<string, string>;
  /** Project -> terminal id -> the name that tab is showing. Only projects
   *  open in this session publish one. */
  terminalTitles: Record<string, Record<string, string>>;
}

export interface Fleet {
  rows: FleetRow[];
  services: FleetServiceGroup[];
  /** Over every row, before the filter, so narrowing the list never hides an
   *  approval prompt from the header. */
  counts: FleetCounts;
  quietProjectCount: number;
  /** A paired Mac's automations cannot be listed at all — say so rather than
   *  imply the list is complete. */
  peerAutomationsHidden: boolean;
  peerAutomationMacs: string[];
}

// A paired Mac stamps its statuses with its own clock, which can run ahead of
// ours; an unstamped entry would otherwise start in 1970.
function stateSinceOf(stamped: number | undefined, now: number): number {
  if (!stamped || stamped < 0) return now;
  return Math.min(stamped, now);
}

function agentRow(
  project: FleetProjectIdentity,
  entry: StatusEntry,
  now: number,
  tabTitles: Record<string, string>,
): FleetRow {
  const title = providerMeta(statusProvider(entry.key)).label;
  const tab = tabTitles[entry.paneID ?? ""];
  return {
    id: `agent:${project.name}:${entry.key}`,
    kind: "agent",
    project,
    title,
    // An untitled tab is named after its agent, which the row already says.
    tabTitle: tab && tab !== title ? tab : null,
    state: agentStateOf(entry.value),
    statusKey: entry.key,
    statusValue: entry.value,
    terminalId: entry.paneID || null,
    jobId: null,
    stateSince: stateSinceOf(entry.timestamp, now),
    detail: null,
    dismissable: false,
    dismissBlocked: null,
  };
}

/** A job spanning several projects headlines none: naming one of its targets
 *  would headline a project that may not be the one running it. */
function automationIdentity(
  targets: string[],
  targetCount: number,
  identities: Map<string, FleetProjectIdentity>,
): FleetProjectIdentity {
  if (targetCount > 1) return namelessIdentity(MULTI_PROJECT_LABEL);
  const name = targets[0] ?? "";
  if (!name) return namelessIdentity(STANDALONE_PROJECT_LABEL);
  return identities.get(name) ?? { ...namelessIdentity(name), name };
}

function automationRow(
  job: FleetJob,
  targets: string[],
  identities: Map<string, FleetProjectIdentity>,
  now: number,
): FleetRow {
  const targetCount = Math.max(job.targetCount ?? 0, targets.length);
  const project = automationIdentity(targets, targetCount, identities);
  return {
    id: `automation:${project.name}:${job.id}`,
    kind: "automation",
    project,
    title: job.label || job.id,
    tabTitle: null,
    state: "working",
    statusKey: null,
    statusValue: null,
    terminalId: null,
    jobId: job.id,
    stateSince: stateSinceOf(
      job.runningSince ? job.runningSince * 1000 : undefined,
      now,
    ),
    detail:
      targetCount > 1
        ? `Running in ${job.runningCount ?? 1} of ${targetCount} projects`
        : null,
    dismissable: false,
    dismissBlocked: null,
  };
}

// Clearing a status wipes every entry on that terminal holding that value, so
// rows sharing (project, terminal, value) would vanish together.
function dismissKey(row: FleetRow): string | null {
  if (row.kind !== "agent" || !row.terminalId || !row.statusValue) return null;
  return `${row.project.name} ${row.terminalId} ${row.statusValue}`;
}

function dismissBlockedReason(row: FleetRow, isShared: boolean): string | null {
  if (row.kind === "automation") {
    return "This automation clears itself when the run finishes.";
  }
  switch (row.state) {
    case "needs-you":
      return "The agent is asking for you — answering it is what clears this.";
    case "working":
      return "The agent is still working — this clears when it finishes.";
    case "idle":
      return "There is nothing to clear on this one.";
  }
  if (!row.terminalId || !row.statusValue) {
    return "This isn't tied to an open terminal, so there is nothing to clear.";
  }
  return isShared
    ? "Another agent shares this terminal — clear it from the terminal so only one goes."
    : null;
}

function markDismissable(rows: FleetRow[]): void {
  const shared = new Map<string, number>();
  for (const row of rows) {
    const key = dismissKey(row);
    if (key) shared.set(key, (shared.get(key) ?? 0) + 1);
  }
  for (const row of rows) {
    const key = dismissKey(row);
    const blocked = dismissBlockedReason(row, key !== null && shared.get(key) !== 1);
    row.dismissable = blocked === null;
    row.dismissBlocked = blocked;
  }
}

/** Needs-you, then problems, then working, then done, then silent; longest in
 *  that state first; ties broken on the stable id so nothing swaps between
 *  renders. */
export function compareFleetRows(a: FleetRow, b: FleetRow): number {
  const rank = AGENT_STATE_RANK[a.state] - AGENT_STATE_RANK[b.state];
  if (rank !== 0) return rank;
  if (a.stateSince !== b.stateSince) return a.stateSince - b.stateSince;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function serviceGroup(
  project: ProjectInfo,
  identity: FleetProjectIdentity,
): FleetServiceGroup | null {
  if (!project.running) return null;
  const running = (project.services ?? []).map((s) => s.name);
  const started = new Set(running);
  const declared = (project.allServices ?? [])
    .map((s) => s.name)
    .filter((name) => !started.has(name));
  if (running.length === 0 && declared.length === 0) return null;
  const ports: Record<string, number> = {};
  for (const s of project.allServices ?? []) if (s.port > 0) ports[s.name] = s.port;
  return { project: identity, running, declared, ports };
}

export function buildFleet(snapshot: FleetSnapshot): Fleet {
  const { projects, jobs, now, filter, peerAliases, terminalTitles } = snapshot;

  const byName = new Map(projects.map((p) => [p.name, p]));
  const identities = new Map<string, FleetProjectIdentity>();
  const peerMacs = new Set<string>();
  for (const project of projects) {
    const slug = peerSlugOf(project.name);
    const peerAlias = slug ? peerAliases[slug] ?? null : null;
    if (peerAlias) peerMacs.add(peerAlias);
    const parent = project.parentName ? byName.get(project.parentName) : undefined;
    identities.set(project.name, fleetIdentityOf(project, parent, peerAlias));
  }

  const rows: FleetRow[] = [];
  const services: FleetServiceGroup[] = [];
  const busy = new Set<string>();
  for (const project of projects) {
    const identity = identities.get(project.name) as FleetProjectIdentity;
    const tabTitles = terminalTitles[project.name] ?? {};
    for (const entry of project.statusEntries ?? []) {
      rows.push(agentRow(identity, entry, now, tabTitles));
      busy.add(project.name);
    }
    const group = serviceGroup(project, identity);
    if (group) {
      services.push(group);
      busy.add(project.name);
    }
  }

  for (const job of jobs) {
    if (job.running !== true) continue;
    const targets = jobTargets(job);
    rows.push(automationRow(job, targets, identities, now));
    // Every project the job runs in is busy, even the ones the row can't name.
    for (const name of targets) busy.add(name);
  }

  markDismissable(rows);

  const counts: FleetCounts = { needsYou: 0, error: 0, working: 0, done: 0 };
  let quietProjectCount = 0;
  for (const row of rows) {
    if (row.state === "needs-you") counts.needsYou++;
    else if (row.state === "error") counts.error++;
    else if (row.state === "working") counts.working++;
    else if (row.state === "done") counts.done++;
  }
  for (const project of projects) {
    if (!busy.has(project.name)) quietProjectCount++;
  }

  const visible = applyFleetFilter(rows.sort(compareFleetRows), services, filter);

  return {
    rows: visible.rows,
    services: visible.services,
    counts,
    quietProjectCount,
    peerAutomationsHidden: peerMacs.size > 0,
    peerAutomationMacs: [...peerMacs],
  };
}

/** "waiting 4m" / "working 2m" — how long the row has held its state. */
export function fleetElapsedLabel(row: FleetRow, now: number): string {
  const span = formatDuration(Math.max(0, Math.floor((now - row.stateSince) / 1000)));
  switch (row.state) {
    case "needs-you":
      return `waiting ${span}`;
    case "error":
      return `error ${span}`;
    case "working":
      return `working ${span}`;
    case "done":
      return `done ${span}`;
    default:
      return `open ${span}`;
  }
}
