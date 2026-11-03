import { create } from "zustand";
import { markRerunning } from "../prChecks";
import type { CommitChecksInfo, PrCheck, PullRequestInfo } from "../types";

// The pull request known for each project's current branch, keyed by project
// root, so the footer link survives re-mounts and a PR created in the modal
// shows up at once. `branch` records which checkout the entry describes: a
// branch switch invalidates it without waiting for the next lookup.
export interface BranchPrEntry {
  branch: string;
  pr: PullRequestInfo | null;
  /** The last pushed commit's checks, while the branch has no open PR. */
  commit?: CommitChecksInfo | null;
  checkedAt: number;
}

interface BranchPrState {
  entries: Record<string, BranchPrEntry>;
  setEntry: (projectPath: string, entry: BranchPrEntry) => void;
  markRerun: (projectPath: string, runIds: string[]) => void;
}

export const useBranchPr = create<BranchPrState>((set) => ({
  entries: {},
  setEntry: (projectPath, entry) =>
    set((s) => ({ entries: { ...s.entries, [projectPath]: entry } })),
  markRerun: (projectPath, runIds) =>
    set((s) => {
      const entry = s.entries[projectPath];
      if (!entry) return s;
      const rerun = <T extends { checks?: PrCheck[] }>(v: T): T =>
        v.checks ? { ...v, checks: markRerunning(v.checks, runIds) } : v;
      const next = { ...entry, pr: entry.pr && rerun(entry.pr), commit: entry.commit && rerun(entry.commit) };
      return { entries: { ...s.entries, [projectPath]: next } };
    }),
}));

// `gh pr create` prints only the new PR's URL; the number is its last path
// segment and a just-created PR is open.
export function prFromCreatedUrl(url: string, title: string, isDraft = false): PullRequestInfo | null {
  const trimmed = url.trim();
  const match = /\/pull\/(\d+)\/?$/.exec(trimmed);
  if (!match) return null;
  return { number: Number(match[1]), url: trimmed, state: "OPEN", title, isDraft };
}

export function rememberCreatedPr(
  projectPath: string,
  branch: string,
  url: string,
  title: string,
  isDraft = false,
) {
  const pr = prFromCreatedUrl(url, title, isDraft);
  if (!pr) return;
  useBranchPr.getState().setEntry(projectPath, { branch, pr, checkedAt: Date.now() });
}
