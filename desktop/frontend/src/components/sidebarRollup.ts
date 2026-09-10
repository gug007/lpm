import { AGENT_STATE_LABEL, agentStateOf } from "../agentStatus";
import { byUrgency, foldByPane } from "../statusByPane";
import type { ProjectInfo } from "../types";
import { BLOCKED_TONE_CLASS, WORK_STATE_LABEL, workStatusKey } from "../workStatus";

/** What a collapsed container is allowed to speak up about.
 *
 *  Of the agent states, `done` and `idle` are the ones nothing is waiting on,
 *  so counting them would only add noise. `running` is not an agent state at
 *  all — it is the project itself being up, the fourth signal the sidebar's
 *  filled green dot already carries. The rest are the marks a person put on the
 *  rows underneath; a custom one is keyed by its own label. */
export type RollupKind =
  | "needs-you"
  | "error"
  | "blocked"
  | "working"
  | "running"
  | "in_progress"
  | "done";

export interface RollupSegment {
  key: string;
  text: string;
  className: string;
}

// Urgency order; lower speaks first. Blocked is a person's own word that a
// row is stuck, so it sits with the agents' problems rather than behind them.
// `running` trails every agent state, and the bookkeeping states come last.
const RANK: Record<RollupKind, number> = {
  "needs-you": 0,
  error: 1,
  blocked: 2,
  working: 3,
  running: 4,
  in_progress: 6,
  done: 7,
};

// A person's own statuses sit between the live signals and the bookkeeping.
const CUSTOM_RANK = 5;

const CLASS: Record<RollupKind, string> = {
  "needs-you": "sidebar-waiting",
  error: "text-[var(--accent-red-text)]",
  blocked: BLOCKED_TONE_CLASS,
  working: "text-[var(--accent-cyan-text)]",
  running: "text-[var(--accent-green-text)]",
  in_progress: "",
  done: "",
};

/** The separator between segments, shared so both headers space it alike. */
export const ROLLUP_SEPARATOR_CLASS = "px-1 opacity-50";

// "Problem" is the only label that is a countable noun; the rest read as verb
// phrases ("2 needs you", "2 in progress") and take no plural.
function noun(kind: RollupKind, count: number): string {
  switch (kind) {
    case "error": {
      const word = AGENT_STATE_LABEL.error.toLowerCase();
      return count === 1 ? word : `${word}s`;
    }
    case "running":
      return "running";
    case "needs-you":
    case "working":
      return AGENT_STATE_LABEL[kind].toLowerCase();
    default:
      return WORK_STATE_LABEL[kind].toLowerCase();
  }
}

interface CustomCount {
  label: string;
  emoji?: string;
  count: number;
}

/** What a header would say about these projects, most urgent first. Empty when
 *  there is nothing worth a second line. */
export function rollupSegments(projects: ProjectInfo[]): RollupSegment[] {
  const counts: Record<RollupKind, number> = {
    "needs-you": 0,
    error: 0,
    blocked: 0,
    working: 0,
    running: 0,
    in_progress: 0,
    done: 0,
  };
  const custom = new Map<string, CustomCount>();
  for (const project of projects) {
    // Counted per tab, the same unit the rows underneath are listed in, so a
    // collapsed header never claims more agents than expanding it shows.
    for (const { entry } of foldByPane([...(project.statusEntries ?? [])].sort(byUrgency))) {
      const state = agentStateOf(entry.value);
      if (state === "needs-you" || state === "error" || state === "working") counts[state]++;
    }
    if (project.running) counts.running++;
    const work = project.workStatus;
    if (!work) continue;
    if (work.state !== "custom") {
      counts[work.state]++;
    } else if (work.label) {
      const key = workStatusKey(work);
      const seen = custom.get(key);
      if (seen) seen.count++;
      else custom.set(key, { label: work.label, emoji: work.emoji, count: 1 });
    }
  }
  const ranked: (RollupSegment & { rank: number })[] = [
    ...(Object.keys(RANK) as RollupKind[])
      .filter((kind) => counts[kind] > 0)
      .map((kind) => ({
        key: kind,
        text: `${counts[kind]} ${noun(kind, counts[kind])}`,
        className: CLASS[kind],
        rank: RANK[kind],
      })),
    ...[...custom].map(([key, { label, emoji, count }]) => ({
      key,
      text: `${count} ${emoji ? `${emoji} ` : ""}${label}`,
      className: "",
      rank: CUSTOM_RANK,
    })),
  ];
  return ranked
    .sort((a, b) => a.rank - b.rank)
    .map(({ key, text, className }) => ({ key, text, className }));
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
