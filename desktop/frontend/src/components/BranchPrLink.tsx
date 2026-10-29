import { GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft } from "lucide-react";
import { BrowserOpenURL } from "../../bridge/runtime";
import { checksSummary } from "../prChecks";
import type { PullRequestInfo } from "../types";
import { BranchPrChecks } from "./BranchPrChecks";

const PILL_CLASS =
  "flex items-center gap-1.5 border border-[var(--composer-border)] bg-[var(--composer-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--composer-fg-secondary)] transition-all duration-100 hover:bg-[var(--composer-hover-bg)] hover:text-[var(--composer-fg)] active:scale-[0.97]";

// The current branch's pull request as a footer pill: number, state colour,
// title on hover, click to open on GitHub. An open PR with CI checks gets a
// second half saying how they stand.
export function BranchPrLink({ pr, projectName }: { pr: PullRequestInfo; projectName: string }) {
  const look = prLook(pr);
  const summary = checksSummary(pr);
  const link = (
    <button
      type="button"
      onClick={() => BrowserOpenURL(pr.url)}
      title={`${look.label} pull request #${pr.number}: ${pr.title}`}
      className={`${PILL_CLASS} ${summary ? "rounded-l-md" : "rounded-md"}`}
    >
      <look.Icon size={12} style={{ color: look.color }} />
      <span className="tabular-nums">PR #{pr.number}</span>
    </button>
  );
  if (!summary) return link;
  return (
    <div className="flex">
      {link}
      <BranchPrChecks
        projectName={projectName}
        pr={pr}
        summary={summary}
        className={`${PILL_CLASS} -ml-px rounded-r-md px-2`}
      />
    </div>
  );
}

export function prLook(pr: PullRequestInfo) {
  if (pr.state === "MERGED") return { Icon: GitMerge, color: "var(--accent-purple)", label: "Merged" };
  if (pr.state === "CLOSED") return { Icon: GitPullRequestClosed, color: "var(--accent-red)", label: "Closed" };
  if (pr.isDraft) return { Icon: GitPullRequestDraft, color: "var(--accent-gray)", label: "Draft" };
  return { Icon: GitPullRequest, color: "var(--accent-green)", label: "Open" };
}
