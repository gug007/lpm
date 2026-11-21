import { checksSummary } from "./prChecks";
import type { PrCheckState, PrMergeMethod, PullRequestMergeInfo } from "./types";

// GitHub's merge button order.
const MERGE_METHODS: PrMergeMethod[] = ["merge", "squash", "rebase"];

export const MERGE_METHOD_LABEL: Record<PrMergeMethod, string> = {
  merge: "Create a merge commit",
  squash: "Squash and merge",
  rebase: "Rebase and merge",
};

const METHOD_KEY = "lpm.prMerge.method";

export function savedMergeMethod(): string | null {
  try {
    return localStorage.getItem(METHOD_KEY);
  } catch {
    return null;
  }
}

export function saveMergeMethod(method: PrMergeMethod): void {
  try {
    localStorage.setItem(METHOD_KEY, method);
  } catch {
    // ignore storage failures (private mode, quota)
  }
}

/** The methods the repository allows; all of GitHub's when it didn't say. */
export function allowedMethods(methods: PrMergeMethod[] | undefined): PrMergeMethod[] {
  const allowed = MERGE_METHODS.filter((method) => methods?.includes(method));
  return allowed.length ? allowed : MERGE_METHODS;
}

/** The method picked last time (squash until then) when the repository allows
 *  it, else its first, as the phone does. */
export function pickMethod(methods: PrMergeMethod[], saved: string | null): PrMergeMethod {
  const allowed = allowedMethods(methods);
  return allowed.find((method) => method === (saved ?? "squash")) ?? allowed[0];
}

export function conflicts(info: PullRequestMergeInfo): boolean {
  return info.merge.mergeable === "CONFLICTING" || info.merge.state === "DIRTY";
}

export const baseName = (info: PullRequestMergeInfo) => info.merge.base || "the base branch";

/** Whether the merge button can go. A `note` says why not when the card's
 *  checks, review and conflict lines don't already. */
type MergeStatus =
  | { kind: "ready" }
  /** GitHub is still working out whether it merges cleanly. */
  | { kind: "checking" }
  | { kind: "waiting" }
  | { kind: "blocked"; note?: string };

// The phone's GitMergeStatus, read the same way, except that failing checks
// hold the button back here instead of hiding it.
export function mergeStatus(info: PullRequestMergeInfo): MergeStatus {
  const { merge } = info;
  const base = merge.base || "its base branch";
  if (info.isDraft || merge.state === "DRAFT") {
    return { kind: "blocked", note: "Draft pull requests can't be merged. Mark it ready for review on GitHub." };
  }
  const verdict = checksSummary(info)?.verdict;
  if (verdict === "fail") return { kind: "blocked" };
  if (verdict === "pending") return { kind: "waiting" };
  if (conflicts(info)) return { kind: "blocked" };
  switch (merge.state) {
    case "CLEAN":
    case "HAS_HOOKS":
    case "UNSTABLE":
      return { kind: "ready" };
    case "BEHIND":
      return { kind: "blocked", note: `This branch is behind ${base}. Update it before merging.` };
    case "BLOCKED":
      if (merge.review === "CHANGES_REQUESTED" || merge.review === "REVIEW_REQUIRED") return { kind: "blocked" };
      return { kind: "blocked", note: `The rules on ${base} don't allow merging yet.` };
    default:
      return { kind: "checking" };
  }
}

interface CardLine {
  text: string;
  tone: PrCheckState;
}

export function reviewLine(review: string): CardLine | null {
  if (review === "APPROVED") return { text: "Approved", tone: "pass" };
  if (review === "CHANGES_REQUESTED") return { text: "Changes requested", tone: "fail" };
  if (review === "REVIEW_REQUIRED") return { text: "Review required", tone: "pending" };
  return null;
}

export function conflictLine(info: PullRequestMergeInfo): CardLine {
  if (conflicts(info)) return { text: `Conflicts with ${baseName(info)}`, tone: "fail" };
  if (info.merge.mergeable === "MERGEABLE") return { text: `No conflicts with ${baseName(info)}`, tone: "pass" };
  return { text: "Checking for conflicts", tone: "pending" };
}

export function mergedText(branch: string, deletedBranch: boolean): string {
  const stays = branch ? `This checkout stays on ${branch}.` : "This checkout stays as it is.";
  return deletedBranch ? `Its branch was deleted on GitHub. ${stays}` : stays;
}
