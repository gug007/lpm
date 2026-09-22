import { GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft } from "lucide-react";
import { BrowserOpenURL } from "../../bridge/runtime";
import type { PullRequestInfo } from "../types";

// The current branch's pull request as a footer pill: number, state colour,
// title on hover, click to open on GitHub.
export function BranchPrLink({ pr }: { pr: PullRequestInfo }) {
  const look = prLook(pr);
  return (
    <button
      type="button"
      onClick={() => BrowserOpenURL(pr.url)}
      title={`${look.label} pull request #${pr.number}: ${pr.title}`}
      className="flex items-center gap-1.5 rounded-md border border-[var(--composer-border)] bg-[var(--composer-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--composer-fg-secondary)] transition-all duration-100 hover:bg-[var(--composer-hover-bg)] hover:text-[var(--composer-fg)] active:scale-[0.97]"
    >
      <look.Icon size={12} style={{ color: look.color }} />
      <span className="tabular-nums">PR #{pr.number}</span>
    </button>
  );
}

export function prLook(pr: PullRequestInfo) {
  if (pr.state === "MERGED") return { Icon: GitMerge, color: "var(--accent-purple)", label: "Merged" };
  if (pr.state === "CLOSED") return { Icon: GitPullRequestClosed, color: "var(--accent-red)", label: "Closed" };
  if (pr.isDraft) return { Icon: GitPullRequestDraft, color: "var(--accent-gray)", label: "Draft" };
  return { Icon: GitPullRequest, color: "var(--accent-green)", label: "Open" };
}
