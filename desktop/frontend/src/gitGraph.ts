import type { HistoryCommit } from "./gitHistory";

// A line in one half of a row: from a lane at the half's top to a lane at its
// bottom. The upper half ends, and the lower half starts, at the commit's dot.
export interface GraphLine {
  from: number;
  to: number;
  branch: number;
}

export interface GraphRow {
  col: number;
  // Which line of history the commit is on; its color, and what hovering it
  // brings forward.
  branch: number;
  merge: boolean;
  top: GraphLine[];
  bottom: GraphLine[];
  // The merged branch's name, on the newest commit of the line a merge drew.
  label: string | null;
}

export interface Graph {
  rows: GraphRow[];
  // Lanes the widest row uses.
  width: number;
}

type GraphCommit = Pick<HistoryCommit, "hash" | "parentHashes" | "subject">;

interface Lane {
  // The commit the lane is waiting for.
  hash: string;
  branch: number;
}

const MERGE_SUBJECTS = [
  /^Merge (?:remote-tracking )?branch '([^']+)'/,
  /^Merge pull request #\d+ from (?:[^/\s]+\/)?(\S+)/,
];

/** The branch a merge commit's subject says it brought in. */
export function mergedBranchName(subject: string): string | null {
  for (const re of MERGE_SUBJECTS) {
    const m = re.exec(subject);
    if (m) return m[1];
  }
  return null;
}

/** Lanes for commits listed children first (`git log --date-order`). Each row
 *  depends only on the rows above it, so a page loaded later continues the
 *  lines the earlier ones left open. */
export function buildGraph(commits: GraphCommit[]): Graph {
  const lanes: (Lane | null)[] = [];
  const names = new Map<number, string>();
  const labelled = new Set<number>();
  const rows: GraphRow[] = [];
  let nextBranch = 0;
  let width = 0;

  const freeLane = () => {
    const i = lanes.indexOf(null);
    return i === -1 ? lanes.length : i;
  };

  for (const commit of commits) {
    let col = lanes.findIndex((lane) => lane?.hash === commit.hash);
    const top: GraphLine[] = [];
    lanes.forEach((lane, i) => {
      if (lane) top.push({ from: i, to: lane.hash === commit.hash ? col : i, branch: lane.branch });
    });
    let branch: number;
    if (col === -1) {
      col = freeLane();
      branch = nextBranch++;
    } else {
      branch = lanes[col]!.branch;
    }
    lanes.forEach((lane, i) => {
      if (lane?.hash === commit.hash) lanes[i] = null;
    });

    const [first, ...others] = commit.parentHashes;
    lanes[col] = first ? { hash: first, branch } : null;
    const bottom: GraphLine[] = [];
    const drawn = new Set<number>();
    for (const parent of others) {
      const waiting = lanes.findIndex((lane) => lane?.hash === parent);
      if (waiting !== -1) {
        bottom.push({ from: col, to: waiting, branch: lanes[waiting]!.branch });
        continue;
      }
      const lane = freeLane();
      const merged = nextBranch++;
      lanes[lane] = { hash: parent, branch: merged };
      const name = mergedBranchName(commit.subject);
      if (name) names.set(merged, name);
      bottom.push({ from: col, to: lane, branch: merged });
      drawn.add(lane);
    }
    lanes.forEach((lane, i) => {
      if (lane && !drawn.has(i)) bottom.push({ from: i, to: i, branch: lane.branch });
    });
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();

    let label: string | null = null;
    const name = names.get(branch);
    if (name && !labelled.has(branch)) {
      label = name;
      labelled.add(branch);
    }
    const used = [col, ...top.map((l) => l.from), ...bottom.map((l) => l.to)];
    width = Math.max(width, Math.max(...used) + 1);
    rows.push({ col, branch, merge: commit.parentHashes.length > 1, top, bottom, label });
  }
  return { rows, width };
}

const LANE_COLORS = ["blue", "purple", "green", "orange", "pink", "teal", "amber", "indigo"];

const laneHue = (branch: number) => LANE_COLORS[branch % LANE_COLORS.length];

export function branchColor(branch: number): string {
  return `var(--accent-${laneHue(branch)})`;
}

/** The same hue at a contrast that reads as text on either theme. */
export function branchTextColor(branch: number): string {
  return `var(--accent-${laneHue(branch)}-text)`;
}
