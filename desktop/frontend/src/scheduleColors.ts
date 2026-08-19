// A stable colour per project for the schedule board, so the same project keeps
// the same hue across days, sessions and machines. Projects carry no colour of
// their own, so it is derived from the name rather than assigned by position —
// adding a project must not reshuffle everyone else's.

// Deliberately excludes the hues that already mean something on this board:
// cyan is "running", red is "failed", amber is "waiting", blue is "unread".
// A project wearing one of those would read as a state. What is left is also
// pruned of near-neighbours (amber/orange, rose/pink, sky/cyan) so two projects
// don't land on hues nobody can tell apart at swatch size.
import { jobTargets, type JobInfo } from "./jobsFormat";

const PALETTE = [
  "violet",
  "emerald",
  "sky",
  "rose",
  "orange",
  "indigo",
  "lime",
  "fuchsia",
] as const;

// Jobs that run in no project at all, or in several at once.
const NEUTRAL = "slate";

function hash(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Which project's colour a job carries. A job running in several folders at
// once has no single hue to claim, so it takes the neutral one.
export function colorProject(job: JobInfo & { project?: string }): string | undefined {
  const targets = jobTargets(job);
  return targets.length === 1 ? targets[0] : undefined;
}

export function projectAccent(project: string | undefined): string {
  if (!project) return NEUTRAL;
  return PALETTE[hash(project) % PALETTE.length];
}

export function accentVar(project: string | undefined): string {
  return `var(--accent-${projectAccent(project)})`;
}

export function accentTextVar(project: string | undefined): string {
  return `var(--accent-${projectAccent(project)}-text)`;
}

// The projects on the board, in the order they first appear, so the legend
// reads in the same order as the columns.
export function legendProjects(projects: (string | undefined)[]): string[] {
  const seen: string[] = [];
  for (const p of projects) {
    if (p && !seen.includes(p)) seen.push(p);
  }
  return seen;
}
