import { BranchCommitChecks, BranchPullRequest } from "../bridge/commands";
import type { CommitChecksInfo, PullRequestInfo } from "./types";

export interface BranchCiLookup {
  pr: PullRequestInfo | null;
  /** The last pushed commit's checks, while the branch has no open PR. */
  commit: CommitChecksInfo | null;
}

// The pull request for the checked-out branch, and while it has none open, the
// checks on the commit it last pushed — asked only when `withCommitChecks`.
export async function fetchBranchCi(projectPath: string, withCommitChecks = true): Promise<BranchCiLookup> {
  let pr: PullRequestInfo | null = null;
  let commit: CommitChecksInfo | null = null;
  try {
    pr = ((await BranchPullRequest(projectPath)) as PullRequestInfo | null) ?? null;
  } catch {
    pr = null;
  }
  if (withCommitChecks && pr?.state !== "OPEN") {
    try {
      commit = ((await BranchCommitChecks(projectPath)) as CommitChecksInfo | null) ?? null;
    } catch {
      commit = null;
    }
  }
  return { pr, commit };
}
