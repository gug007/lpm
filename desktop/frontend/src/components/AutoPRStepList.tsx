import { Check, Loader2, Minus, X } from "lucide-react";
import {
  AUTO_PR_STEP_IDS,
  type AutoPRRepoState,
  type AutoPRStep,
  type AutoPRStepId,
  type AutoPRStepStatus,
} from "../autoPR";

const STEP_LABELS: Record<AutoPRStepId, string> = {
  branch: "Create branch",
  commit: "Commit changes",
  push: "Push",
  pr: "Open pull request",
};

function skippedDetail(id: AutoPRStepId, state: AutoPRRepoState | null): string {
  if (!state) return "";
  switch (id) {
    case "branch":
      return `Already on ${state.branch}`;
    case "commit":
      return "No uncommitted changes";
    case "push":
      return "Already pushed";
    default:
      return "";
  }
}

export function AutoPRStepList({
  steps,
  repoState,
}: {
  steps: Record<AutoPRStepId, AutoPRStep>;
  repoState: AutoPRRepoState | null;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] py-1">
      {AUTO_PR_STEP_IDS.map((id) => {
        const step = steps[id];
        const detail =
          step.status === "skipped"
            ? skippedDetail(id, repoState)
            : step.status === "failed"
              ? undefined
              : step.detail;
        const dim = step.status === "pending" || step.status === "skipped";
        return (
          <div key={id} className="flex items-start gap-3 px-4 py-2.5">
            <StepStatusIcon status={step.status} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span
                className={`text-[13px] ${
                  dim ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"
                }`}
              >
                {STEP_LABELS[id]}
              </span>
              {detail && (
                <span
                  className={`truncate text-[11px] ${
                    step.status === "done"
                      ? "font-mono text-[var(--text-secondary)]"
                      : "text-[var(--text-muted)]"
                  }`}
                  title={detail}
                >
                  {detail}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StepStatusIcon({ status }: { status: AutoPRStepStatus }) {
  const base = "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center";
  switch (status) {
    case "running":
      return (
        <span className={`${base} text-[var(--accent-blue)]`}>
          <Loader2 size={14} className="animate-spin" />
        </span>
      );
    case "done":
      return (
        <span className={`${base} rounded-full bg-[var(--accent-green)]/15 text-[var(--accent-green)]`}>
          <Check size={11} strokeWidth={3} />
        </span>
      );
    case "failed":
      return (
        <span className={`${base} rounded-full bg-[var(--accent-red)]/15 text-[var(--accent-red)]`}>
          <X size={11} strokeWidth={3} />
        </span>
      );
    case "skipped":
      return (
        <span className={`${base} text-[var(--text-muted)]`}>
          <Minus size={12} />
        </span>
      );
    default:
      return (
        <span className={base}>
          <span className="h-2 w-2 rounded-full border border-[var(--text-muted)]/60" />
        </span>
      );
  }
}
