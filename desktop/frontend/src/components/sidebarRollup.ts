import { AGENT_STATE_LABEL, AGENT_STATE_RANK, agentStateOf } from "../agentStatus";
import type { ProjectInfo } from "../types";

/** What a collapsed container is allowed to speak up about.
 *
 *  `done` and `idle` are the agent states nothing is waiting on, so counting
 *  them would only add noise. `running` is not an agent state at all — it is the
 *  project itself being up, the fourth signal the sidebar's filled green dot
 *  already carries. */
export type RollupKind = "needs-you" | "error" | "working" | "running";

export interface RollupSegment {
  key: RollupKind;
  text: string;
  className: string;
}

const KINDS: RollupKind[] = ["needs-you", "error", "working", "running"];

const RANK: Record<RollupKind, number> = {
  "needs-you": AGENT_STATE_RANK["needs-you"],
  error: AGENT_STATE_RANK.error,
  working: AGENT_STATE_RANK.working,
  // Behind every agent state, including the ones no segment is built for, so
  // adding one later can only push `running` further down.
  running: AGENT_STATE_RANK.idle + 1,
};

const CLASS: Record<RollupKind, string> = {
  "needs-you": "sidebar-waiting",
  error: "text-[var(--accent-red-text)]",
  working: "text-[var(--accent-cyan-text)]",
  running: "text-[var(--accent-green-text)]",
};

// "Problem" is the only label that is a countable noun; the rest read as verb
// phrases ("2 needs you", "2 working") and take no plural.
const COUNTABLE: Record<RollupKind, boolean> = {
  "needs-you": false,
  error: true,
  working: false,
  running: false,
};

/** The separator between segments, shared so both headers space it alike. */
export const ROLLUP_SEPARATOR_CLASS = "px-1 opacity-50";

function noun(kind: RollupKind, count: number): string {
  const label = kind === "running" ? "running" : AGENT_STATE_LABEL[kind].toLowerCase();
  return COUNTABLE[kind] && count !== 1 ? `${label}s` : label;
}

/** What a header would say about these projects, most urgent first. Empty when
 *  there is nothing worth a second line. */
export function rollupSegments(projects: ProjectInfo[]): RollupSegment[] {
  const counts: Record<RollupKind, number> = {
    "needs-you": 0,
    error: 0,
    working: 0,
    running: 0,
  };
  for (const project of projects) {
    for (const entry of project.statusEntries ?? []) {
      const state = agentStateOf(entry.value);
      if (state === "needs-you" || state === "error" || state === "working") counts[state]++;
    }
    if (project.running) counts.running++;
  }
  return KINDS.filter((kind) => counts[kind] > 0)
    .sort((a, b) => RANK[a] - RANK[b])
    .map((kind) => ({
      key: kind,
      text: `${counts[kind]} ${noun(kind, counts[kind])}`,
      className: CLASS[kind],
    }));
}

export interface VisibleRollup {
  shown: RollupSegment[];
  overflow: number;
}

/** A line only has room for so much, and truncation runs in urgency order, so
 *  the most urgent segments survive and the rest become a "+{k}". */
export function visibleRollup(segments: RollupSegment[], max = 2): VisibleRollup {
  return { shown: segments.slice(0, max), overflow: Math.max(0, segments.length - max) };
}
