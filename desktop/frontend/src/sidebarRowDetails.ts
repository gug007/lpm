import { checksLabel, checksSummary, summarizeChecks, type ChecksSummary } from "./prChecks";
import { originMark } from "./originStatus";
import { prLook } from "./prLook";
import { relativeTime } from "./relativeTime";
import type { RowDetail, SidebarRowLayout } from "./sidebarRowLayout";
import type { BranchPrEntry } from "./store/branchPr";
import type { OriginEntry } from "./store/originStatus";
import type { PullRequestInfo } from "./types";

export interface RowDetailInfo {
  label: string;
  hint: string;
}

export const ROW_DETAIL_INFO: Record<RowDetail, RowDetailInfo> = {
  status: { label: "Status note", hint: "The note under a status you set, a crash, or folded copies" },
  alert: { label: "Agent alert", hint: "An agent that needs you or hit a problem" },
  pr: { label: "Pull request", hint: "The branch's pull request, colored by its state" },
  checks: { label: "Checks", hint: "Whether the branch's checks pass, fail or still run" },
  origin: { label: "Origin", hint: "Commits to pull from origin, with the button that pulls them" },
  ahead: { label: "Unpushed", hint: "Commits here that origin doesn't have yet" },
  branch: { label: "Branch", hint: "The branch the project is on" },
  changes: { label: "Changes", hint: "Lines added and removed" },
  files: { label: "Changed files", hint: "How many files changed" },
  commit: { label: "Last commit", hint: "How long ago the last commit was made" },
  ports: { label: "Ports", hint: "Ports the project's services and terminals listen on" },
  version: { label: "Version", hint: "The version in package.json, Cargo.toml or pyproject.toml" },
};

export const ROW_DETAIL_GROUPS: { label: string; details: RowDetail[] }[] = [
  { label: "Work", details: ["status", "alert"] },
  { label: "Review", details: ["pr", "checks"] },
  { label: "Git", details: ["branch", "changes", "files", "origin", "ahead", "commit"] },
  { label: "Running", details: ["ports", "version"] },
];

// project_row_stats: what the checkout itself says (rowstats.rs).
export interface RowStats {
  branch: string;
  defaultBranch: string;
  insertions: number;
  deletions: number;
  files: number;
  lastCommitAt: number;
  version: string;
}

export interface RowData {
  stats?: RowStats;
  ci?: BranchPrEntry;
  origin?: OriginEntry;
  ports?: number[];
}

// What a row already knows without any lookup of its own.
export interface RowBuiltIns {
  alert: boolean;
  status: boolean;
  origin: boolean;
}

export function rowBranch(data: RowData): string {
  return data.stats?.branch || data.origin?.status.branch || "";
}

// An entry for another branch is stale: a checkout moved on since it was asked.
export function rowPr(data: RowData): PullRequestInfo | null {
  const entry = data.ci;
  if (!entry?.pr || entry.branch !== rowBranch(data)) return null;
  return entry.pr;
}

// An open pull request's checks, or else the last pushed commit's.
export function entryChecks(entry: BranchPrEntry): ChecksSummary | null {
  if (entry.pr?.state === "OPEN") return checksSummary(entry.pr);
  return summarizeChecks(entry.commit?.checks ?? []);
}

export function rowChecks(data: RowData): ChecksSummary | null {
  const entry = data.ci;
  if (!entry || entry.branch !== rowBranch(data)) return null;
  return entryChecks(entry);
}

export function originShows(entry: OriginEntry | undefined): boolean {
  if (!entry) return false;
  return entry.running || Boolean(entry.done) || originMark(entry.status) !== null;
}

export function unpushed(entry: OriginEntry | undefined): number {
  const s = entry?.status;
  if (!s?.hasUpstream || s.conflicted || s.behind > 0) return 0;
  return Math.max(0, s.ahead);
}

export function showsBranch(data: RowData, layout: SidebarRowLayout): boolean {
  const branch = rowBranch(data);
  if (!branch) return false;
  const base = data.stats?.defaultBranch || data.origin?.status.base || "";
  return !(layout.hideDefaultBranch && branch === base);
}

export function detailShows(
  detail: RowDetail,
  data: RowData,
  builtIns: RowBuiltIns,
  layout: SidebarRowLayout,
): boolean {
  switch (detail) {
    case "status":
      return builtIns.status;
    case "alert":
      return builtIns.alert;
    case "origin":
      return builtIns.origin && originShows(data.origin);
    case "ahead":
      return builtIns.origin && unpushed(data.origin) > 0;
    case "branch":
      return showsBranch(data, layout);
    case "changes":
      return (data.stats?.insertions ?? 0) + (data.stats?.deletions ?? 0) > 0;
    case "files":
      return (data.stats?.files ?? 0) > 0;
    case "commit":
      return (data.stats?.lastCommitAt ?? 0) > 0;
    case "version":
      return Boolean(data.stats?.version);
    case "ports":
      return (data.ports?.length ?? 0) > 0;
    case "pr":
      return rowPr(data) !== null;
    case "checks": {
      const summary = rowChecks(data);
      if (!summary) return false;
      return !(layout.checksOnlyFailing && summary.verdict === "pass");
    }
  }
}

// A detail as plain text for one project, for the Row builder's tray; empty
// when the row would show nothing. Undefined for the details the row draws
// from elsewhere (an agent's word, a status note), which have no preview.
export function detailText(
  detail: RowDetail,
  data: RowData,
  builtIns: RowBuiltIns,
  layout: SidebarRowLayout,
): string | undefined {
  if (detail === "alert" || detail === "status") return undefined;
  if (!detailShows(detail, data, builtIns, layout)) return "";
  const stats = data.stats;
  switch (detail) {
    case "branch":
      return rowBranch(data);
    case "changes":
      return `+${stats?.insertions ?? 0} −${stats?.deletions ?? 0}`;
    case "files":
      return `${stats?.files ?? 0} file${stats?.files === 1 ? "" : "s"}`;
    case "commit":
      return relativeTime(stats?.lastCommitAt ?? 0);
    case "version":
      return versionText(stats?.version ?? "");
    case "ports":
      return portsText(data.ports ?? []);
    case "ahead":
      return `↑${unpushed(data.origin)}`;
    case "pr": {
      const pr = rowPr(data);
      return pr ? `#${pr.number} ${prLook(pr).label}` : "";
    }
    case "checks": {
      const summary = rowChecks(data);
      return summary ? checksLabel(summary) : "";
    }
    case "origin": {
      const mark = originMark(data.origin?.status);
      if (!mark) return data.origin?.done ?? "";
      if (mark.kind === "conflict") return "Conflict";
      if (mark.kind === "diverged") return `↑${mark.ahead} ↓${mark.behind}`;
      return mark.kind === "base" && !mark.onBase ? `${mark.base} +${mark.behind}` : `↓${mark.behind}`;
    }
  }
}

export function versionText(version: string): string {
  return /^\d/.test(version) ? `v${version}` : version;
}

export function portsText(ports: readonly number[]): string {
  return ports.map((p) => `:${p}`).join(" ");
}
