import { dirname, joinPath } from "../../path";
import type { CommandMap } from "../backend";
import { addProject, cloneGit, freeName, project, type Project } from "./state";

// The dialog's label starts as the copy's folder name, so that's what it's called.
function copyName(label: unknown, fallback: string): string {
  return freeName(typeof label === "string" && label.trim() ? label.trim() : fallback);
}

function copyOf(src: Project, name: string, root: string): Project {
  return {
    ...src,
    name,
    root,
    label: undefined,
    parentName: src.parentName ?? src.name,
    running: new Set(),
    activeProfile: "",
    session: undefined,
    git: cloneGit(src.git),
    files: { ...src.files },
  };
}

// A full copy of the folder: same branch, uncommitted edits and all, unless the
// dialog left them out.
function duplicate({ name: source, label, excludeUncommitted }: Record<string, unknown>): string {
  const src = project(String(source));
  if (!src) throw new Error(`project "${source}" not found`);
  const name = copyName(label, `${src.parentName ?? src.name}-2`);
  const copy = copyOf(src, name, joinPath(dirname(src.root), name));
  if (excludeUncommitted) atHead(copy);
  addProject(copy);
  return name;
}

// A Git worktree: the last commit, checked out on a branch of its own.
function worktree({ name: source, label }: Record<string, unknown>): string {
  const src = project(String(source));
  if (!src) throw new Error(`project "${source}" not found`);
  const name = copyName(label, `${src.parentName ?? src.name}-wt`);
  const copy = copyOf(src, name, joinPath(dirname(src.root), `.worktrees/${name}`));
  copy.worktree = true;
  atHead(copy);
  const branch = `lpm/${name}`;
  copy.git = { ...copy.git, branch, upstream: false, ahead: 0, behind: 0 };
  copy.git.branches = [{ name: branch, ageMs: 0 }, ...copy.git.branches];
  addProject(copy);
  return name;
}

function atHead(p: Project): void {
  for (const c of p.git.changes) {
    if (c.status === "added") delete p.files[c.path];
    else p.files[c.path] = c.original;
  }
  p.git = { ...p.git, changes: [] };
}

// The git-ignored files a sample worktree can bring, and what each project
// chose, kept for the visit like every other demo edit.
const IGNORED = [
  { path: ".env", size: 1214, suggested: true },
  { path: ".env.local", size: 340, suggested: true },
  { path: "log/development.log", size: 48_210, suggested: false },
];
const chosenFiles = new Map<string, { copy: string[]; link: string[] }>();

function ownerOf(name: unknown): string {
  const p = project(String(name));
  return p?.parentName ?? String(name);
}

function worktreeFiles({ name }: Record<string, unknown>) {
  const suggested = { copy: IGNORED.filter((f) => f.suggested).map((f) => f.path), link: [] };
  return { candidates: IGNORED, ...(chosenFiles.get(ownerOf(name)) ?? suggested) };
}

function setWorktreeFiles({ name, copy, link }: Record<string, unknown>): null {
  chosenFiles.set(ownerOf(name), { copy: [...(copy as string[])], link: [...(link as string[])] });
  return null;
}

export const copyCommands: CommandMap = {
  worktree_files: worktreeFiles,
  set_worktree_files: setWorktreeFiles,
  duplicate_project: duplicate,
  start_duplicate_project: duplicate,
  duplicate_worktree_project: worktree,
  start_duplicate_worktree_project: worktree,
  duplicate_status: () => ({ done: { ok: true, error: null } }),
};
