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
  fetched: boolean;
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
    a.conflicted === b.conflicted
  );
}
