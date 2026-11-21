import { GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft } from "lucide-react";
import type { PullRequestInfo } from "./types";

/** A pull request's icon, colour and word for its state. */
export function prLook(pr: PullRequestInfo) {
  if (pr.state === "MERGED") return { Icon: GitMerge, color: "var(--accent-purple)", label: "Merged" };
  if (pr.state === "CLOSED") return { Icon: GitPullRequestClosed, color: "var(--accent-red)", label: "Closed" };
  if (pr.isDraft) return { Icon: GitPullRequestDraft, color: "var(--accent-gray)", label: "Draft" };
  return { Icon: GitPullRequest, color: "var(--accent-green)", label: "Open" };
}
