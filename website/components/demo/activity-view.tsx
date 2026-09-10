"use client";

import { useState } from "react";
import { Clock, Layers, Server, Terminal, X } from "lucide-react";
import {
  ACTIVITY_STATE_LABEL,
  ACTIVITY_STATE_STYLE,
  activityRows,
  type ActivityInput,
  type ActivityKind,
  type ActivityRow,
  type ActivityState,
} from "./activity";
import { DEMO_EPOCH, seededSince } from "./agent-terminal";
import type { DemoJob } from "./automations";
import { FOCUS_RING, PRESS, useReducedMotion } from "./ui";
import { useSecondsClock } from "./use-seconds-clock";

const KINDS: { value: ActivityKind | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "agent", label: "Agents" },
  { value: "service", label: "Services" },
  { value: "automation", label: "Automations" },
];

const STATE_MOTION: Partial<Record<ActivityState, string>> = {
  "needs-you": "sidebar-waiting",
  working: "sidebar-shimmer",
};

function formatDuration(secs: number): string {
  if (secs < 60) return `${Math.max(0, Math.round(secs))}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) {
    const rest = Math.round(secs % 60);
    return rest > 0 ? `${mins}m ${rest}s` : `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

function elapsedSeconds(clock: RowClock, now: number): number {
  return ((clock.until ?? now) - clock.since) / 1000;
}

function elapsedLabel(state: ActivityState, secs: number): string {
  const span = formatDuration(secs);
  switch (state) {
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

/** When a row's state began, and when it stopped counting. A row still working
 *  or still asking reports no `until`, exactly as the sidebar's row does. */
type RowClock = { since: number; until?: number };

// A row here and the sidebar row beside it are the same session, so both read
// their age off the same start. The ids mirror the ones activityRows builds.
function agentClocks(input: ActivityInput): Map<string, RowClock> {
  const clocks = new Map<string, RowClock>();
  for (const project of input.projects) {
    const tabs = input.agentTabStatusByProject[project.name] ?? {};
    const keys = Object.keys(tabs);
    for (const key of keys) {
      const { since, until } = tabs[key];
      if (since !== undefined) {
        clocks.set(`agent:${project.name}:${key}`, { since, until });
      }
    }
    const rollup = input.aiStatusByProject[project.name];
    if (rollup && keys.length === 0) {
      clocks.set(`agent:${project.name}`, {
        since: seededSince(rollup),
        // Only a landed turn stops counting; the rest keep ticking.
        ...(rollup === "done" ? { until: DEMO_EPOCH } : {}),
      });
    }
  }
  return clocks;
}

const AGO = /^(\d+)([smhd])/;
const AGO_UNIT: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

// Automations is one click away and states when each job last ran, so the row
// here counts from that moment rather than from a clock of its own.
function lastRunSince(job: DemoJob, now: number): number | undefined {
  const match = AGO.exec(job.lastRun.trim());
  if (match) return now - Number(match[1]) * AGO_UNIT[match[2]];
  return job.lastRun.startsWith("just now") ? now : undefined;
}

// A service or a run the visitor started carries no start time in the demo's
// state, so its row counts from when the list first saw it — a reading the
// list can back up, and one that never jumps. Kept across visits to the view.
const FIRST_SEEN = new Map<string, number>();

function firstSeen(ids: string[], now: number): (id: string) => number {
  for (const id of FIRST_SEEN.keys()) {
    if (!ids.includes(id)) FIRST_SEEN.delete(id);
  }
  for (const id of ids) {
    if (!FIRST_SEEN.has(id)) FIRST_SEEN.set(id, now);
  }
  return (id) => FIRST_SEEN.get(id) ?? now;
}

type ActivityViewProps = ActivityInput & {
  onOpenProject: (name: string) => void;
  onOpenAutomations: () => void;
};

// Why a row refuses to clear, in the app's own words. A row still working or
// still asking is not stale — clearing it would hide the one thing the view
// exists to surface, while the sidebar went on showing it.
function dismissBlockedReason(row: ActivityRow): string | null {
  if (row.kind === "automation") {
    return "This automation clears itself when the run finishes.";
  }
  if (row.kind === "service") {
    return "The service is still running — stopping it is what clears this.";
  }
  switch (row.state) {
    case "needs-you":
      return "The agent is asking for you — answering it is what clears this.";
    case "working":
      return "The agent is still working — this clears when it finishes.";
    case "idle":
      return "There is nothing to clear on this one.";
    default:
      return null;
  }
}

export function ActivityView({
  onOpenProject,
  onOpenAutomations,
  ...input
}: ActivityViewProps) {
  const [kind, setKind] = useState<ActivityKind | "all">("all");
  const [dismissed, setDismissed] = useState<string[]>([]);
  const reducedMotion = useReducedMotion();
  // The same once-a-second reading of the wall clock the sidebar's rows use.
  const now = useSecondsClock(false);
  const rows = activityRows(input).filter((row) => !dismissed.includes(row.id));
  const shown = kind === "all" ? rows : rows.filter((row) => row.kind === kind);
  const clocks = agentClocks(input);
  const seenAt = firstSeen(rows.map((row) => row.id), now);

  const clockFor = (row: ActivityRow): RowClock => {
    const agent = clocks.get(row.id);
    if (agent) return agent;
    if (row.kind === "automation") {
      const job = input.jobs.find((j) => `job:${j.id}` === row.id);
      const since = job && !job.running ? lastRunSince(job, now) : undefined;
      if (since !== undefined) return { since };
    }
    return { since: seenAt(row.id) };
  };

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#1a1a1a]">
      <div className="flex h-12 shrink-0 items-center gap-2.5 px-3 sm:px-4">
        <span className="text-[#919191]">
          <Layers className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <div className="text-base font-semibold leading-tight text-[#e5e5e5]">Activity</div>
          <div className="text-[11px] text-[#919191]">
            Your agents, services and automations, with anything waiting on you first
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center border-t border-[#2e2e2e] px-3 py-2 sm:px-4">
        <div
          role="group"
          aria-label="Filter activity by kind"
          className="inline-flex rounded-lg border border-[#2e2e2e] bg-[#242424] p-0.5"
        >
          {KINDS.map((option) => {
            const active = kind === option.value;
            const count =
              option.value === "all"
                ? rows.length
                : rows.filter((row) => row.kind === option.value).length;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setKind(option.value)}
                aria-pressed={active}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                  active
                    ? "bg-[#333333] text-[#e5e5e5]"
                    : "text-[#919191] hover:bg-[#2a2a2a] hover:text-[#b3b3b3]"
                } ${FOCUS_RING}`}
              >
                {option.label}
                <span className="tabular-nums text-[#8e8e8e]">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-3">
        {shown.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-[#2e2e2e] bg-[#242424] text-[#919191]">
              <Layers className="h-[19px] w-[19px]" strokeWidth={1.75} />
            </span>
            <h2 className="text-[15px] font-semibold text-[#e5e5e5]">Nothing is running</h2>
            <p className="mt-1.5 max-w-sm text-[12px] leading-relaxed text-[#b3b3b3]">
              Start a project&apos;s services or launch an agent and it shows up here — across every
              project, without hunting through tabs.
            </p>
          </div>
        ) : (
          shown.map((row) => (
            <ActivityRowItem
              key={row.id}
              row={row}
              elapsed={elapsedLabel(row.state, elapsedSeconds(clockFor(row), now))}
              reducedMotion={reducedMotion}
              onOpen={() =>
                row.kind === "automation" ? onOpenAutomations() : onOpenProject(row.project)
              }
              onDismiss={() => setDismissed((prev) => [...prev, row.id])}
              dismissBlocked={dismissBlockedReason(row)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function KindIcon({ kind }: { kind: ActivityKind }) {
  if (kind === "automation") return <Clock className="h-4 w-4" strokeWidth={1.75} />;
  if (kind === "service") return <Server className="h-4 w-4" strokeWidth={1.75} />;
  return <Terminal className="h-4 w-4" strokeWidth={1.75} />;
}

function ActivityRowItem({
  row,
  elapsed,
  reducedMotion,
  onOpen,
  onDismiss,
  dismissBlocked,
}: {
  row: ActivityRow;
  elapsed: string;
  reducedMotion: boolean;
  onOpen: () => void;
  onDismiss: () => void;
  /** Why this row refuses to clear, or null when it will. */
  dismissBlocked: string | null;
}) {
  const style = ACTIVITY_STATE_STYLE[row.state];
  const animate = row.state === "working" && !reducedMotion;
  const stateClass = reducedMotion ? style.text : STATE_MOTION[row.state] ?? style.text;

  return (
    <div
      onClick={onOpen}
      className="group flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[#2a2a2a]"
    >
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#2a2a2a] ${
          animate ? "sidebar-shimmer-icon" : "text-[#919191]"
        }`}
      >
        <KindIcon kind={row.kind} />
      </span>
      {/* No handler: a click here bubbles to the row, which is also what Enter
          on the focused button dispatches. */}
      <button type="button" className={`min-w-0 flex-1 rounded-md text-left ${FOCUS_RING}`}>
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-[13px] font-medium text-[#e5e5e5]">
            {row.projectLabel}
          </span>
          <span className="min-w-0 truncate text-[12px] text-[#919191]">{row.title}</span>
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-[#919191]">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot} ${
              animate ? "animate-pulse" : ""
            }`}
          />
          <span className={`shrink-0 ${stateClass}`}>{ACTIVITY_STATE_LABEL[row.state]}</span>
          <span className="min-w-0 truncate">· {row.detail}</span>
        </span>
      </button>
      <span className="w-24 shrink-0 whitespace-nowrap text-right text-[12px] tabular-nums text-[#919191]">
        {elapsed}
      </span>
      <button
        type="button"
        disabled={dismissBlocked !== null}
        onClick={(event) => {
          event.stopPropagation();
          onDismiss();
        }}
        aria-label={
          dismissBlocked ??
          `Clear ${ACTIVITY_STATE_LABEL[row.state]} on ${row.projectLabel || row.title}`
        }
        title={dismissBlocked ?? "Clear this row"}
        className={`shrink-0 rounded-md p-1.5 text-[#919191] opacity-0 focus-visible:opacity-100 group-hover:opacity-100 ${
          dismissBlocked === null
            ? "hover:bg-[#333333] hover:text-[#e5e5e5]"
            : "cursor-not-allowed disabled:opacity-0 disabled:group-hover:opacity-35"
        } ${FOCUS_RING} ${PRESS}`}
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}
