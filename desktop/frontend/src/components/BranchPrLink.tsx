import { useRef, useState } from "react";
import { BrowserOpenURL } from "../../bridge/runtime";
import { checksLabel, checksSummary } from "../prChecks";
import { prLook } from "../prLook";
import { useBranchPr } from "../store/branchPr";
import type { PullRequestInfo } from "../types";
import { ChecksButton, checkStateIcon } from "./ChecksButton";
import { FOOTER_PILL_CLASS } from "./footerPill";
import { PrMergeCard } from "./PrMergeCard";
import { ContextMenuShell } from "./ui/ContextMenuShell";

interface BranchPrLinkProps {
  pr: PullRequestInfo;
  branch: string;
  projectName: string;
  projectPath: string;
}

// The current branch's pull request as a footer pill: number, state colour,
// title on hover. A click on an open one shows its card, to merge it from here;
// a merged or closed one opens on GitHub. An open PR with CI checks gets a
// second half saying how they stand.
export function BranchPrLink({ pr, branch, projectName, projectPath }: BranchPrLinkProps) {
  const look = prLook(pr);
  const summary = checksSummary(pr);
  const markRerun = useBranchPr((s) => s.markRerun);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isOpen = pr.state === "OPEN";
  const link = (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (isOpen ? setOpen((v) => !v) : BrowserOpenURL(pr.url))}
        aria-haspopup={isOpen ? "dialog" : undefined}
        aria-expanded={isOpen ? open : undefined}
        title={`${look.label} pull request #${pr.number}: ${pr.title}`}
        className={`${FOOTER_PILL_CLASS} ${summary ? "rounded-l-md" : "rounded-md"} ${open ? "bg-[var(--composer-hover-bg)] text-[var(--composer-fg)]" : ""}`}
      >
        <look.Icon size={12} style={{ color: look.color }} />
        <span className="tabular-nums">PR #{pr.number}</span>
      </button>
      {open && isOpen && buttonRef.current && (
        <ContextMenuShell anchor={buttonRef.current} align="end" side="top" minWidth={300} onClose={() => setOpen(false)}>
          <PrMergeCard
            pr={pr}
            branch={branch}
            projectName={projectName}
            projectPath={projectPath}
            onClose={() => setOpen(false)}
          />
        </ContextMenuShell>
      )}
    </>
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
