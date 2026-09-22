import { create } from "zustand";
import type { PullRequestInfo } from "../types";

// The pull request known for each project's current branch, keyed by project
// root, so the footer link survives re-mounts and a PR created in the modal
// shows up at once. `branch` records which checkout the entry describes: a
// branch switch invalidates it without waiting for the next lookup.
export interface BranchPrEntry {
  branch: string;
  pr: PullRequestInfo | null;
  checkedAt: number;
}

interface BranchPrState {
  entries: Record<string, BranchPrEntry>;
  setEntry: (projectPath: string, entry: BranchPrEntry) => void;
}

export const useBranchPr = create<BranchPrState>((set) => ({
  entries: {},
  setEntry: (projectPath, entry) =>
    set((s) => ({ entries: { ...s.entries, [projectPath]: entry } })),
}));

// `gh pr create` prints only the new PR's URL; the number is its last path
// segment and a just-created PR is open and, from the modal, never a draft.
export function prFromCreatedUrl(url: string, title: string): PullRequestInfo | null {
  const trimmed = url.trim();
  const match = /\/pull\/(\d+)\/?$/.exec(trimmed);
  if (!match) return null;
  return { number: Number(match[1]), url: trimmed, state: "OPEN", title, isDraft: false };
}

export function rememberCreatedPr(projectPath: string, branch: string, url: string, title: string) {
  const pr = prFromCreatedUrl(url, title);
  if (!pr) return;
  useBranchPr.getState().setEntry(projectPath, { branch, pr, checkedAt: Date.now() });
}
