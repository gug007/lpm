import { useRef, useState, type ReactNode } from "react";
import { CircleCheck, CircleMinus, CircleX, ExternalLink, LoaderCircle, RotateCcw } from "lucide-react";
import { RerunFailedChecks } from "../../bridge/commands";
import { BrowserOpenURL } from "../../bridge/runtime";
import { toast } from "../notifications/toast";
import { startFix } from "../ciFix";
import type { LaunchpadOption } from "../launchpadAgentActions";
import { failingRunIds, sortedChecks, type ChecksSummary } from "../prChecks";
import type { PrCheck, PrCheckState } from "../types";
import { FixWithAgentItems } from "./FixWithAgentItems";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuShell } from "./ui/ContextMenuShell";

const STATE_ICON: Record<PrCheckState, { Icon: typeof CircleX; color: string; spin?: boolean }> = {
  fail: { Icon: CircleX, color: "var(--accent-red)" },
  pending: { Icon: LoaderCircle, color: "var(--accent-amber)", spin: true },
  pass: { Icon: CircleCheck, color: "var(--accent-green)" },
  skipped: { Icon: CircleMinus, color: "var(--text-muted)" },
};

export function checkStateIcon(state: PrCheckState) {
  const look = STATE_ICON[state];
  return <look.Icon size={12} style={{ color: look.color }} className={look.spin ? "animate-spin" : undefined} />;
}

interface ChecksButtonProps {
  projectName: string;
  projectPath: string;
  checks: PrCheck[];
  summary: ChecksSummary;
  /** What the menu's first line names: "Checks on #128", "Checks on main · fcb454f". */
  heading: string;
  subheading?: string;
  note?: string;
  title: string;
  githubUrl: string;
  /** What a Fix with … agent is told; the items show only with one. */
  fixPrompt?: string;
  onRerun: (runIds: string[]) => void;
  className: string;
  children: ReactNode;
}

/** A footer pill saying how CI stands, and on click every check with ways to
 *  get the failing ones fixed or run again. */
export function ChecksButton({
  projectName,
  projectPath,
  checks,
  summary,
  heading,
  subheading,
  note,
  title,
  githubUrl,
  fixPrompt,
  onRerun,
  className,
  children,
}: ChecksButtonProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sorted = sortedChecks(checks);
  const runIds = failingRunIds(checks);

  const fix = (option: LaunchpadOption) => {
    setOpen(false);
    if (fixPrompt) startFix(projectName, option, fixPrompt);
  };

  const rerun = () => {
    setOpen(false);
    RerunFailedChecks(projectPath, runIds)
      .then(() => {
        onRerun(runIds);
        toast.success("Running the failed jobs again");
      })
      .catch((err: unknown) =>
        toast.error("Couldn't run the failed jobs again", {
          description: String(err),
        }),
      );
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        className={className}
      >
        {children}
      </button>
      {open && buttonRef.current && (
        <ContextMenuShell anchor={buttonRef.current} align="end" minWidth={260} onClose={() => setOpen(false)}>
          <div className="max-w-[400px]">
            <div className="px-3 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
              {heading}
            </div>
            {subheading && (
              <div className="truncate px-3 pb-1.5 text-[11px] text-[var(--text-muted)]">{subheading}</div>
            )}
            {note && (
              <div className="mx-2 mb-1.5 rounded-md bg-[color-mix(in_srgb,var(--accent-amber)_12%,transparent)] px-2 py-1.5 text-[11px] text-[var(--text-secondary)]">
                {note}
              </div>
            )}
            <div className="max-h-64 overflow-y-auto">
              {sorted.map((check) => (
                <ContextMenuItem
                  key={`${check.workflow}/${check.name}`}
                  icon={checkStateIcon(check.state)}
                  label={check.name}
                  trailing={
                    check.workflow || check.commit ? (
                      <span className="truncate text-[10px] text-[var(--text-muted)]">
                        {[check.workflow, check.commit && `on ${check.commit}`].filter(Boolean).join(" · ")}
                      </span>
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
            {summary.failed > 0 && fixPrompt && <FixWithAgentItems projectName={projectName} onFix={fix} />}
            {runIds.length > 0 && (
              <ContextMenuItem icon={<RotateCcw size={12} />} label="Re-run failed jobs" onClick={rerun} />
            )}
            <ContextMenuItem
              icon={<ExternalLink size={12} />}
              label="Open checks on GitHub"
              onClick={() => {
                setOpen(false);
                BrowserOpenURL(githubUrl);
              }}
            />
          </div>
        </ContextMenuShell>
      )}
    </>
  );
}
