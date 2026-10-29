import { useRef, useState } from "react";
import { CircleCheck, CircleMinus, CircleX, ExternalLink, LoaderCircle } from "lucide-react";
import { BrowserOpenURL } from "../../bridge/runtime";
import { toast } from "../notifications/toast";
import { askClaudeInNewTab } from "../agentTabPrompt";
import { checksLabel, fixChecksPrompt, sortedChecks, type ChecksSummary } from "../prChecks";
import type { PrCheckState, PullRequestInfo } from "../types";
import { AgentGlyph } from "./terminal/AgentGlyph";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuShell } from "./ui/ContextMenuShell";

const STATE_ICON: Record<PrCheckState, { Icon: typeof CircleX; color: string; spin?: boolean }> = {
  fail: { Icon: CircleX, color: "var(--accent-red)" },
  pending: { Icon: LoaderCircle, color: "var(--accent-amber)", spin: true },
  pass: { Icon: CircleCheck, color: "var(--accent-green)" },
  skipped: { Icon: CircleMinus, color: "var(--text-muted)" },
};

function stateIcon(state: PrCheckState) {
  const look = STATE_ICON[state];
  return <look.Icon size={12} style={{ color: look.color }} className={look.spin ? "animate-spin" : undefined} />;
}

interface BranchPrChecksProps {
  projectName: string;
  pr: PullRequestInfo;
  summary: ChecksSummary;
  className: string;
}

/** The checks half of the footer's PR pill: how CI stands, and on click every
 *  check with a way to hand the failing ones to Claude. */
export function BranchPrChecks({ projectName, pr, summary, className }: BranchPrChecksProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const checks = sortedChecks(pr.checks ?? []);
  const label = checksLabel(summary);

  const fixWithClaude = () => {
    setOpen(false);
    askClaudeInNewTab(projectName, fixChecksPrompt(pr));
    toast.success("Started Claude in a new tab to fix the checks");
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Checks on #${pr.number}: ${label}`}
        className={className}
      >
        {stateIcon(summary.verdict)}
        {summary.verdict !== "pass" && <span className="tabular-nums">{label}</span>}
      </button>
      {open && buttonRef.current && (
        <ContextMenuShell anchor={buttonRef.current} align="end" minWidth={240} onClose={() => setOpen(false)}>
          <div className="px-3 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
            Checks on #{pr.number}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {checks.map((check) => (
              <ContextMenuItem
                key={`${check.workflow}/${check.name}`}
                icon={stateIcon(check.state)}
                label={check.name}
                trailing={
                  check.workflow ? (
                    <span className="truncate text-[10px] text-[var(--text-muted)]">{check.workflow}</span>
                  ) : undefined
                }
                disabled={!check.url}
                title={check.url ? `Open ${check.name}` : undefined}
                onClick={() => {
                  setOpen(false);
                  BrowserOpenURL(check.url);
                }}
              />
            ))}
          </div>
          <ContextMenuSeparator />
          {summary.failed > 0 && (
            <ContextMenuItem
              icon={<AgentGlyph agent="claude" size={12} />}
              label="Fix with Claude"
              description="Opens a new tab with the failing checks"
              onClick={fixWithClaude}
            />
          )}
          <ContextMenuItem
            icon={<ExternalLink size={12} />}
            label="Open checks on GitHub"
            onClick={() => {
              setOpen(false);
              BrowserOpenURL(`${pr.url}/checks`);
            }}
          />
        </ContextMenuShell>
      )}
    </>
  );
}
