import { useCallback, useEffect, useRef, useState } from "react";
import { GitBranchBase, GitChangedFilesRef } from "../../../bridge/commands";
import { useGitChanged } from "../../hooks/useGitChanged";
import { sameFiles, type ChangedFile } from "./useChangedFiles";

// Where the branch's own work starts (git_branch_base.rs).
export interface BranchBase {
  rev: string;
  name: string;
  // "since": the branch left `name`; "unpushed": commits `name` lacks.
  range: "since" | "unpushed";
  commits: number;
}

export type BranchChanges =
  | { status: "loading" }
  | { status: "ready"; base: BranchBase | null; files: ChangedFile[] }
  | { status: "error"; message: string };

// What "N commits since main" says about the branch.
export function branchCaption(base: BranchBase): string {
  const commits = `${base.commits} commit${base.commits === 1 ? "" : "s"}`;
  return base.range === "since" ? `${commits} since ${base.name}` : `${commits} not on ${base.name}`;
}

// The stack's name in the header.
export function branchStackLabel(base: BranchBase): string {
  return base.range === "since" ? `Branch since ${base.name}` : `Not yet on ${base.name}`;
}

function sameBranchChanges(a: BranchChanges, b: BranchChanges): boolean {
  if (a.status !== "ready" || b.status !== "ready") return false;
  const [x, y] = [a.base, b.base];
  const sameBase =
    x === y ||
    (!!x && !!y && x.rev === y.rev && x.name === y.name && x.range === y.range && x.commits === y.commits);
  return sameBase && sameFiles(a.files, b.files);
}

// Every file the branch's own commits changed, fetched the first time the
// changes rail is shown. Only HEAD or the base moving changes it, and the
// watcher reports those as a change to git's own files (no paths), so edits to
// the working tree leave it alone; a change while hidden is caught up on the
// next showing.
export function useBranchChanges(root: string, active: boolean): BranchChanges {
  const [changes, setChanges] = useState<BranchChanges>({ status: "loading" });
  const reqRef = useRef(0);
  const loadedRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    loadedRef.current = root;
    const token = ++reqRef.current;
    let next: BranchChanges;
    try {
      const base = (await GitBranchBase(root)) as BranchBase | null;
      const raw = base ? ((await GitChangedFilesRef(root, base.rev)) as ChangedFile[]) : [];
      const files = Array.isArray(raw) ? raw.map((f) => ({ path: f.path, status: f.status })) : [];
      next = { status: "ready", base: base ?? null, files };
    } catch (err) {
      next = { status: "error", message: String(err) };
    }
    if (token === reqRef.current) setChanges((prev) => (sameBranchChanges(prev, next) ? prev : next));
  }, [root]);

  useEffect(() => {
    if (active && loadedRef.current !== root) void refresh();
  }, [active, root, refresh]);

  const onChanged = useCallback(
    (files: string[] | null) => {
      if (files === null) void refresh();
    },
    [refresh],
  );
  useGitChanged(root, onChanged, active);

  return changes;
}
