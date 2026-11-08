import { BranchPullRequest, GitChangedFiles } from "../bridge/commands";
import { count } from "./count";
import { peerSlugOf } from "./peer/markers";
import type { MergedCopy } from "./store/mergedCopies";
import type { ProjectInfo, PullRequestInfo } from "./types";

// A copy whose pull request has merged and holds all of its commits, or null.
// Anything that can't be read counts as not merged.
export async function readMergedCopy(root: string): Promise<MergedCopy | null> {
  try {
    const pr = (await BranchPullRequest(root)) as PullRequestInfo | null;
    if (pr?.state !== "MERGED" || !pr.headMerged) return null;
    const files = (await GitChangedFiles(root)) as unknown[] | null;
    return { number: pr.number, title: pr.title, clean: (files ?? []).length === 0 };
  } catch {
    return null;
  }
}

interface OfferState {
  entries: Record<string, MergedCopy>;
  dismissed: Record<string, number>;
  // A copy to leave out for now: one being removed, or with an agent at work.
  skip: (project: ProjectInfo) => boolean;
}

// The copies to offer removing. A batch removal runs on one computer, so while
// this one has any they go first and a paired computer's wait their turn.
export function offeredCopies(projects: ProjectInfo[], { entries, dismissed, skip }: OfferState): ProjectInfo[] {
  const offered = projects.filter((p) => {
    const copy = entries[p.root];
    return p.parentName && copy?.clean && dismissed[p.name] !== copy.number && !skip(p);
  });
  const machine = offered.some((p) => !peerSlugOf(p.name)) ? null : peerSlugOf(offered[0]?.name);
  return offered.filter((p) => peerSlugOf(p.name) === machine);
}

export function mergedOfferText(copies: ProjectInfo[], parentLabel: string | null): string {
  const copiesLabel = count(copies.length, "copy", "copies");
  const verb = copies.length === 1 ? "is" : "are";
  return parentLabel ? `${copiesLabel} of ${parentLabel} ${verb} merged.` : `${copiesLabel} ${verb} merged.`;
}

export const removeCopiesLabel = (total: number) => `Remove ${count(total, "copy", "copies")}`;
