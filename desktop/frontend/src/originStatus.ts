// What a project's sidebar row says about its branch on origin, and what its
// button does. Derived from `git_origin_status`; see gitorigin.rs.
export interface OriginStatus {
  branch: string;
  hasUpstream: boolean;
  ahead: number;
  behind: number;
  // For a branch with no upstream: the default branch it's measured against.
  base: string;
  baseBehind: number;
  conflicted: boolean;
  // Tracked files with uncommitted changes; counted only while origin has news.
  changes: number;
  fetched: boolean;
  // The repository and branch the upstream is, alike for every copy of it on any
  // Mac, and the commit it's at here. Missing from a Mac on an older lpm.
  upstreamKey?: string;
  upstreamSha?: string;
}

export type OriginMark =
  | { kind: "behind"; behind: number }
  | { kind: "diverged"; ahead: number; behind: number }
  | { kind: "base"; base: string; behind: number; onBase: boolean }
  | { kind: "conflict" };

export function originMark(status: OriginStatus | undefined): OriginMark | null {
  if (!status?.branch) return null;
  if (status.conflicted) return { kind: "conflict" };
  if (status.hasUpstream) {
    if (status.behind <= 0) return null;
    return status.ahead > 0
      ? { kind: "diverged", ahead: status.ahead, behind: status.behind }
      : { kind: "behind", behind: status.behind };
  }
  if (!status.base || status.baseBehind <= 0) return null;
  return {
    kind: "base",
    base: status.base,
    behind: status.baseBehind,
    onBase: status.base === status.branch,
  };
}

// A mark whose button only pulls. A whole deck is caught up on these alone: Sync
// would push, Update would merge, and a conflict needs a person.
export function isPlainPull(mark: OriginMark | null): boolean {
  return mark?.kind === "behind" || (mark?.kind === "base" && mark.onBase);
}

// Uncommitted changes stop a pull or merge whose incoming files they touch, so a
// project with any waits until they're committed or stashed. A pull set to
// autostash carries them across instead; a merge has no such setting here.
export function heldByChanges(status: OriginStatus, mark: OriginMark | null, autostash: boolean): boolean {
  if (!mark || mark.kind === "conflict" || !status.changes) return false;
  return !(autostash && (mark.kind === "behind" || mark.kind === "diverged"));
}

const commits = (n: number) => `${n} new commit${n === 1 ? "" : "s"}`;

export function originMarkTitle(mark: OriginMark, branch: string): string {
  switch (mark.kind) {
    case "behind":
      return `Origin has ${commits(mark.behind)} on ${branch}`;
    case "diverged":
      return `Origin has ${commits(mark.behind)} on ${branch}, and ${mark.ahead} of yours aren’t pushed`;
    case "base":
      return mark.onBase
        ? `Origin has ${commits(mark.behind)} on ${mark.base}`
        : `${mark.base} on origin has ${commits(mark.behind)} that ${branch} doesn’t`;
    case "conflict":
      return "The last pull or merge stopped on conflicts";
  }
}

export function originHeldTitle(mark: OriginMark, status: OriginStatus): string {
  const files = status.changes === 1 ? "1 file here has" : `${status.changes} files here have`;
  return `${originMarkTitle(mark, status.branch)}. ${files} uncommitted changes: commit or stash them first`;
}

export function originActionLabel(mark: OriginMark): string {
  switch (mark.kind) {
    case "behind":
      return `↓ Pull ${mark.behind}`;
    case "diverged":
      return "Sync";
    case "base":
      return mark.onBase ? `↓ Pull ${mark.behind}` : "Update";
    case "conflict":
      return "Resolve";
  }
}

export function originActionTitle(mark: OriginMark, branch: string): string {
  switch (mark.kind) {
    case "behind":
      return `Pull ${commits(mark.behind)} from origin`;
    case "diverged":
      return `Pull ${mark.behind} from origin, then push your ${mark.ahead}`;
    case "base":
      return mark.onBase
        ? `Bring ${mark.base} up to origin/${mark.base}`
        : `Merge origin/${mark.base} into ${branch}`;
    case "conflict":
      return "Show the conflicted files";
  }
}

export function originDoneText(mark: OriginMark): string {
  switch (mark.kind) {
    case "behind":
      return `Pulled ${mark.behind}`;
    case "diverged":
      return "Synced";
    case "base":
      return mark.onBase ? `Pulled ${mark.behind}` : `Updated from ${mark.base}`;
    case "conflict":
      return "";
  }
}

export function sameOriginStatus(a: OriginStatus | undefined, b: OriginStatus): boolean {
  return (
    !!a &&
    a.branch === b.branch &&
    a.hasUpstream === b.hasUpstream &&
    a.ahead === b.ahead &&
    a.behind === b.behind &&
    a.base === b.base &&
    a.baseBehind === b.baseBehind &&
    a.conflicted === b.conflicted &&
    a.changes === b.changes &&
    a.upstreamKey === b.upstreamKey &&
    a.upstreamSha === b.upstreamSha
  );
}
