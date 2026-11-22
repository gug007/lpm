import { checksSummary } from "./prChecks";
import { prWords } from "./gitForge";
import type { PrCheckState, PrMergeMethod, PrMergeWatch, PullRequestMergeInfo } from "./types";

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

/** How the card can merge it now. A `note` says why the button is held back
 *  when the checks, review and conflict lines don't already. */
export interface MergeStatus {
  /** "checking" while GitHub works out whether it merges cleanly. */
  kind: "ready" | "checking" | "waiting" | "blocked";
  note?: string;
  /** Checks are running: lpm can merge once they pass. */
  wait: boolean;
  /** GitHub merges it as it stands. */
  now: boolean;
  /** Can merge as it stands past the base branch's rules ("Bypass requirements"). */
  bypass: boolean;
}

const MERGES_AS_IS = new Set(["CLEAN", "HAS_HOOKS", "UNSTABLE"]);

// The phone's GitMergeStatus, read the same way, except that failing checks
// hold the button back here instead of hiding it, running checks can be waited
// for, and someone GitHub lets bypass the rules may.
export function mergeStatus(info: PullRequestMergeInfo): MergeStatus {
  const { merge } = info;
  const base = merge.base || "its base branch";
  const none = { wait: false, now: false, bypass: false };
  const bypass = !!merge.canBypass && (merge.state === "BLOCKED" || merge.state === "BEHIND");
  if (info.isDraft || merge.state === "DRAFT") {
    const words = prWords(info);
    const note = `Draft ${words.noun}s can't be merged. Mark it ready for review on ${words.site}.`;
    return { kind: "blocked", note, ...none };
  }
  if (conflicts(info)) return { kind: "blocked", ...none };
  const verdict = checksSummary(info)?.verdict;
  if (verdict === "fail") return { kind: "blocked", ...none, bypass };
  if (verdict === "pending") return { kind: "waiting", wait: true, now: MERGES_AS_IS.has(merge.state), bypass };
  if (MERGES_AS_IS.has(merge.state)) return { kind: "ready", ...none, now: true };
  const bypassHint = bypass ? " You can bypass them from the arrow beside the merge button." : "";
  switch (merge.state) {
    case "BEHIND":
      return { kind: "blocked", note: `This branch is behind ${base}. Update it before merging.`, ...none, bypass };
    case "BLOCKED":
      if (merge.review === "CHANGES_REQUESTED" || merge.review === "REVIEW_REQUIRED") {
        return { kind: "blocked", ...none, bypass };
      }
      return { kind: "blocked", note: `The rules on ${base} don't allow merging yet.${bypassHint}`, ...none, bypass };
    default:
      return { kind: "checking", ...none };
  }
}

/** What the merge button does: wait for the checks, merge as it stands, or
 *  bypass the rules. */
export type MergeMode = "wait" | "now" | "bypass";

/** The mode picked when it's still on offer, else the first of waiting and
 *  merging now; bypassing is only ever picked by hand, as on GitHub. */
export function mergeMode(status: MergeStatus, picked: MergeMode | null): MergeMode | null {
  if (picked && status[picked]) return picked;
  if (status.wait) return "wait";
  if (status.now) return "now";
  return null;
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

const bypassClause = (base: string) => `, bypassing the rules on ${base} if they still block it`;

/** What "When checks pass" in the merge menu does. */
export function waitText(running: number, bypass: boolean, base: string): string {
  const checks = running === 1 ? "the running check passes" : `the ${running} running checks pass`;
  return `lpm merges once ${checks}${bypass ? bypassClause(base) : ""}`;
}

/** What an armed wait will do, in the card. */
export function armedText(
  watch: Pick<PrMergeWatch, "method" | "bypass" | "deleteBranch">,
  base: string,
  site = "GitHub",
): string {
  const bypass = watch.bypass ? bypassClause(base) : "";
  const branch = watch.deleteBranch ? `, then delete the branch on ${site}` : "";
  return `${MERGE_METHOD_LABEL[watch.method]} once the running checks pass${bypass}${branch}. Stops if a check fails.`;
}

export function mergedText(branch: string, deletedBranch: boolean): string {
  const stays = branch ? `This checkout stays on ${branch}.` : "This checkout stays as it is.";
  return deletedBranch ? `Its branch was deleted on GitHub. ${stays}` : stays;
}
