import {
  GitChangedFiles,
  GitCommitCount,
  GitDefaultBranch,
  GitStatus,
} from "../bridge/commands";
import { count } from "./count";
import { peerRawName } from "./peer/markers";
import type { ProjectInfo } from "./types";

// Work in a copy that exists nowhere else, so deleting the copy loses it.
export interface UnsavedWork {
  changed: number;
  untracked: number;
  unpushed: number;
  // The branch unpushed commits are counted against when the copy's branch has
  // no upstream; null when they are counted against the upstream.
  base: string | null;
}

interface StatusLike {
  isGitRepo?: boolean;
  branch?: string;
  hasUpstream?: boolean;
  ahead?: number;
}

interface ChangedFileLike {
  path: string;
  status: string;
}

export async function loadUnsavedWork(root: string): Promise<UnsavedWork | null> {
  const status = (await GitStatus(root)) as StatusLike | null;
  if (!status?.isGitRepo) return null;
  const files = ((await GitChangedFiles(root)) ?? []) as ChangedFileLike[];
  const untracked = files.filter((f) => f.status === "untracked").length;
  const changed = new Set(files.filter((f) => f.status !== "untracked").map((f) => f.path)).size;
  if (status.hasUpstream) {
    return { changed, untracked, unpushed: status.ahead ?? 0, base: null };
  }
  const base = String((await GitDefaultBranch(root)) ?? "");
  if (!base || base === status.branch) return { changed, untracked, unpushed: 0, base: null };
  const unpushed = Number(await GitCommitCount(root, base, "HEAD")) || 0;
  return { changed, untracked, unpushed, base };
}

export function unsavedWorkLines(work: UnsavedWork): string[] {
  const lines: string[] = [];
  if (work.changed > 0) lines.push(`${count(work.changed, "changed file", "changed files")} not committed`);
  if (work.untracked > 0) lines.push(count(work.untracked, "untracked file", "untracked files"));
  if (work.unpushed > 0) {
    const commits = count(work.unpushed, "commit", "commits");
    lines.push(work.base ? `${commits} not on ${work.base}` : `${commits} not pushed`);
  }
  return lines;
}

// The branch lpm made for a worktree, deleted along with it.
export function worktreeBranch(project: Pick<ProjectInfo, "name" | "worktreeBranch">): string {
  return project.worktreeBranch ?? worktreeBranchName(peerRawName(project.name));
}

// Mirrors projects_crud.rs worktree_branch_name: the branch of a worktree whose
// project doesn't name one.
export function worktreeBranchName(name: string): string {
  let component = "";
  for (const ch of name) {
    const normalized = /^[A-Za-z0-9_-]$/.test(ch) ? ch : "-";
    if (normalized !== "-" || !component.endsWith("-")) component += normalized;
  }
  component = component.replace(/^-+|-+$/g, "");
  return `lpm/${component || "worktree"}`;
}
