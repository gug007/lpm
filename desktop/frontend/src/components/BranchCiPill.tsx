import { checksLabel, summarizeChecks } from "../prChecks";
import { useBranchPr } from "../store/branchPr";
import type { CommitChecksInfo } from "../types";
import { ChecksButton, checkStateIcon } from "./ChecksButton";
import { FOOTER_PILL_CLASS } from "./footerPill";

interface BranchCiPillProps {
  projectName: string;
  projectPath: string;
  branch: string;
  commit: CommitChecksInfo;
  /** Local commits not pushed yet, which CI hasn't seen. */
  ahead: number;
}

const commits = (n: number) => (n === 1 ? "1 commit" : `${n} commits`);

// CI for a branch with no open pull request, beside the branch button: the
// checks on the commit it last pushed, with the same menu a PR's checks have.
export function BranchCiPill({ projectName, projectPath, branch, commit, ahead }: BranchCiPillProps) {
  const markRerun = useBranchPr((s) => s.markRerun);
  const summary = summarizeChecks(commit.checks);
  if (!summary) return null;
  const short = commit.sha.slice(0, 7);
  const label = checksLabel(summary);
  const unpushed = ahead > 0 ? `${commits(ahead)} not pushed yet` : "";
  return (
    <ChecksButton
      projectName={projectName}
      projectPath={projectPath}
      checks={commit.checks}
      summary={summary}
      heading={`Checks on ${branch} · ${short}`}
      subheading={commit.title}
      note={unpushed && `${unpushed}. These checks are for ${short}, the last one you pushed.`}
      title={`CI on ${branch}: ${label}${unpushed && ` · ${unpushed}`}`}
      githubUrl={`${commit.url}/checks`}
      fixPrompt={commit.fixPrompt}
      onRerun={(runIds) => markRerun(projectPath, runIds)}
      className={`${FOOTER_PILL_CLASS} rounded-md ${unpushed ? "opacity-60 hover:opacity-100" : ""}`}
    >
      {checkStateIcon(summary.verdict)}
      <span>CI</span>
      {summary.verdict !== "pass" && <span className="tabular-nums text-[var(--text-muted)]">{label}</span>}
    </ChecksButton>
  );
}
