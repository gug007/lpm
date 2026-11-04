import type { HistoryCommit } from "./gitHistory";
import type { ChecksVerdict } from "./prChecks";
import type { CommitCi } from "./types";

export type CommitCiStates = ReadonlyMap<string, ChecksVerdict>;

export const NO_COMMIT_CI: CommitCiStates = new Map();

/** What a commit's row shows on the right: its CI result, or that CI can't have
 *  seen it yet. Null when there's nothing to say. */
export type CommitCiMark = ChecksVerdict | "unpushed";

const LABELS: Record<CommitCiMark, string> = {
  fail: "CI failed",
  pending: "CI running",
  pass: "CI passed",
  unpushed: "Not pushed yet",
};

export function commitCiStates(commits: CommitCi[]): CommitCiStates {
  return new Map(commits.map((commit) => [commit.sha, commit.state]));
}

export function commitCiMark(commit: Pick<HistoryCommit, "hash" | "unpushed">, states: CommitCiStates): CommitCiMark | null {
  if (commit.unpushed) return "unpushed";
  return states.get(commit.hash) ?? null;
}

export function commitCiLabel(mark: CommitCiMark): string {
  return LABELS[mark];
}

export function hasRunningCi(states: CommitCiStates): boolean {
  return [...states.values()].includes("pending");
}
