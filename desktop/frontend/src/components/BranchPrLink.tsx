import { GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft } from "lucide-react";
import { BrowserOpenURL } from "../../bridge/runtime";
import { checksLabel, checksSummary } from "../prChecks";
import { useBranchPr } from "../store/branchPr";
import type { PullRequestInfo } from "../types";
import { ChecksButton, checkStateIcon } from "./ChecksButton";
import { FOOTER_PILL_CLASS } from "./footerPill";

interface BranchPrLinkProps {
  pr: PullRequestInfo;
  projectName: string;
  projectPath: string;
}

// The current branch's pull request as a footer pill: number, state colour,
// title on hover, click to open on GitHub. An open PR with CI checks gets a
// second half saying how they stand.
export function BranchPrLink({ pr, projectName, projectPath }: BranchPrLinkProps) {
  const look = prLook(pr);
  const summary = checksSummary(pr);
  const markRerun = useBranchPr((s) => s.markRerun);
  const link = (
    <button
      type="button"
      onClick={() => BrowserOpenURL(pr.url)}
      title={`${look.label} pull request #${pr.number}: ${pr.title}`}
      className={`${FOOTER_PILL_CLASS} ${summary ? "rounded-l-md" : "rounded-md"}`}
    >
      <look.Icon size={12} style={{ color: look.color }} />
      <span className="tabular-nums">PR #{pr.number}</span>
    </button>
  );
  if (!summary) return link;
  const label = checksLabel(summary);
  return (
    <div className="flex">
      {link}
      <ChecksButton
        projectName={projectName}
        projectPath={projectPath}
        checks={pr.checks ?? []}
        summary={summary}
        heading={`Checks on #${pr.number}`}
        title={`Checks on #${pr.number}: ${label}`}
        githubUrl={`${pr.url}/checks`}
        fixPrompt={pr.fixPrompt}
        onRerun={(runIds) => markRerun(projectPath, runIds)}
        className={`${FOOTER_PILL_CLASS} -ml-px rounded-r-md px-2`}
      >
        {checkStateIcon(summary.verdict)}
        {summary.verdict !== "pass" && <span className="tabular-nums">{label}</span>}
      </ChecksButton>
    </div>
  );
}

export function prLook(pr: PullRequestInfo) {
  if (pr.state === "MERGED") return { Icon: GitMerge, color: "var(--accent-purple)", label: "Merged" };
  if (pr.state === "CLOSED") return { Icon: GitPullRequestClosed, color: "var(--accent-red)", label: "Closed" };
  if (pr.isDraft) return { Icon: GitPullRequestDraft, color: "var(--accent-gray)", label: "Draft" };
  return { Icon: GitPullRequest, color: "var(--accent-green)", label: "Open" };
}
