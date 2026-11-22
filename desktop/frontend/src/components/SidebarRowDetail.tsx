import { CircleCheck, CircleDashed, CircleX, GitBranch } from "lucide-react";
import type { ReactNode } from "react";
import { checksLabel, type ChecksVerdict } from "../prChecks";
import { prLook } from "../prLook";
import { relativeAgo, relativeTime } from "../relativeTime";
import {
  portsText,
  rowBranch,
  rowChecks,
  rowPr,
  unpushed,
  versionText,
  type RowData,
} from "../sidebarRowDetails";
import type { RowDetail, SidebarRowLayout } from "../sidebarRowLayout";
import type { PullRequestInfo } from "../types";

// What the row already draws for itself, handed in rather than looked up.
export interface RowBuiltInNodes {
  alert?: ReactNode;
  status?: ReactNode;
  origin?: ReactNode;
}

export interface SidebarRowDetailProps {
  detail: RowDetail;
  data: RowData;
  layout: SidebarRowLayout;
  builtIns: RowBuiltInNodes;
  // A pull request at a line's right end reads as a small outlined chip.
  chip: boolean;
}

// Static on purpose: a spinner on every row would keep the window drawing.
const VERDICT_ICON: Record<ChecksVerdict, { Icon: typeof CircleX; color: string }> = {
  fail: { Icon: CircleX, color: "var(--accent-red)" },
  pending: { Icon: CircleDashed, color: "var(--accent-amber)" },
  pass: { Icon: CircleCheck, color: "var(--accent-green)" },
};

function prTextColor(pr: PullRequestInfo): string {
  if (pr.state === "MERGED") return "var(--accent-purple-text)";
  if (pr.state === "CLOSED") return "var(--accent-red-text)";
  if (pr.isDraft) return "var(--accent-gray-text)";
  return "var(--accent-green-text)";
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** One detail on a project's sidebar row, or nothing when it has none. */
export function SidebarRowDetail({ detail, data, layout, builtIns, chip }: SidebarRowDetailProps) {
  switch (detail) {
    case "alert":
    case "status":
    case "origin":
      return <>{builtIns[detail] ?? null}</>;
    case "branch": {
      const branch = rowBranch(data);
      return (
        <span className="inline-flex min-w-0 items-center gap-1" title={`On ${branch}`}>
          <GitBranch size={10} className="shrink-0" aria-hidden="true" />
          <span className="truncate">{branch}</span>
        </span>
      );
    }
    case "changes": {
      const stats = data.stats;
      if (!stats) return null;
      const since = layout.changesSince === "branch" ? "since the branch started" : "since the last commit";
      return (
        <span
          className="shrink-0 tabular-nums"
          title={`${plural(stats.insertions, "line")} added, ${stats.deletions} removed ${since}`}
        >
          <span className="text-[var(--accent-green-text)]">+{stats.insertions}</span>{" "}
          <span className="text-[var(--accent-red-text)]">−{stats.deletions}</span>
        </span>
      );
    }
    case "files": {
      const files = data.stats?.files ?? 0;
      return <span className="shrink-0 tabular-nums">{plural(files, "file")}</span>;
    }
    case "commit": {
      const at = data.stats?.lastCommitAt ?? 0;
      return (
        <span className="shrink-0 tabular-nums" title={`Last commit ${relativeAgo(at)}`}>
          {relativeTime(at)}
        </span>
      );
    }
    case "version":
      return <span className="shrink-0">{versionText(data.stats?.version ?? "")}</span>;
    case "ports":
      return <span className="shrink-0 tabular-nums">{portsText(data.ports ?? [])}</span>;
    case "ahead": {
      const n = unpushed(data.origin);
      return (
        <span className="shrink-0 tabular-nums" title={`${plural(n, "commit")} to push`}>
          ↑{n}
        </span>
      );
    }
    case "pr": {
      const pr = rowPr(data);
      if (!pr) return null;
      const look = prLook(pr);
      const text = `#${pr.number}${layout.prStateWord ? ` ${look.label}` : ""}`;
      return (
        <span
          className={`shrink-0 font-semibold tabular-nums ${
            chip ? "inline-flex h-4 items-center rounded border border-current px-1 leading-none" : ""
          }`}
          style={{ color: prTextColor(pr) }}
          title={`${look.label}: ${pr.title}`}
        >
          {text}
        </span>
      );
    }
    case "checks": {
      const summary = rowChecks(data);
      if (!summary) return null;
      const { Icon, color } = VERDICT_ICON[summary.verdict];
      return (
        <span className="flex shrink-0 items-center" title={checksLabel(summary)}>
          <Icon size={11} style={{ color }} aria-label={checksLabel(summary)} />
        </span>
      );
    }
  }
}
