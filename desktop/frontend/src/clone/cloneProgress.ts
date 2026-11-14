export type ClonePhase = "counting" | "compressing" | "receiving" | "resolving" | "checkout";

export const CLONE_PROGRESS_EVENT = "clone-progress";

export const CLONE_PHASES: { key: ClonePhase; short: string; title: string; unit: string }[] = [
  { key: "counting", short: "Counting", title: "Counting objects", unit: "objects" },
  { key: "compressing", short: "Compressing", title: "Compressing objects", unit: "objects" },
  { key: "receiving", short: "Receiving", title: "Receiving objects", unit: "objects" },
  { key: "resolving", short: "Resolving", title: "Resolving deltas", unit: "deltas" },
  { key: "checkout", short: "Checking out", title: "Checking out files", unit: "files" },
];

// One `clone-progress` event, as clonerun.rs sends it.
export interface CloneProgressEvent {
  id: string;
  phase: ClonePhase;
  percent: number | null;
  done: number | null;
  total: number | null;
  size: string | null;
  speed: string | null;
  finished: boolean;
}

export interface CloneProgress {
  phase: ClonePhase;
  percent: number | null;
  done: number | null;
  total: number | null;
  // How much has come down, kept once receiving is over.
  size: string | null;
  // Only while something is still coming down.
  speed: string | null;
  finished: boolean;
}

export type PhaseMark = "done" | "current" | "todo";

const order = (phase: ClonePhase) => CLONE_PHASES.findIndex((p) => p.key === phase);

export function phaseInfo(phase: ClonePhase) {
  return CLONE_PHASES[order(phase)] ?? CLONE_PHASES[0];
}

export function applyCloneProgress(prev: CloneProgress | null, e: CloneProgressEvent): CloneProgress | null {
  if (order(e.phase) < 0) return prev;
  if (prev && order(e.phase) < order(prev.phase)) return prev;
  return {
    phase: e.phase,
    percent: e.percent,
    done: e.done,
    total: e.total,
    size: e.size ?? prev?.size ?? null,
    speed: e.finished ? null : e.speed,
    finished: e.finished,
  };
}

export function phaseMarks(progress: CloneProgress | null): Record<ClonePhase, PhaseMark> {
  const at = progress ? order(progress.phase) : -1;
  return Object.fromEntries(
    CLONE_PHASES.map((p, i) => {
      if (i < at || (i === at && progress?.finished)) return [p.key, "done"];
      return [p.key, i === at ? "current" : "todo"];
    }),
  ) as Record<ClonePhase, PhaseMark>;
}

export function countLabel(progress: CloneProgress): string | null {
  const { done, total } = progress;
  if (done == null) return null;
  const unit = phaseInfo(progress.phase).unit;
  const n = (v: number) => v.toLocaleString("en-US");
  return total != null ? `${n(done)} / ${n(total)} ${unit}` : `${n(done)} ${unit}`;
}
