import type { ClaudeAccount } from "../types";
import type { ClaudeAccountStatus } from "../store/accounts";
import { deriveClaudeSetupSteps } from "../claudeSetupSteps";

interface ClaudeAccountsSetupGuideProps {
  accounts: ClaudeAccount[];
  statuses: Record<string, ClaudeAccountStatus>;
  usage: Record<string, string[]>;
}

const STEPS = [
  { title: "Add an account", hint: "A name is enough — Work, Personal, Client." },
  { title: "Sign in", hint: "Opens a terminal running claude /login." },
  { title: "Assign it to a project", hint: "Project → Config → Claude account." },
] as const;

export function ClaudeAccountsSetupGuide({
  accounts,
  statuses,
  usage,
}: ClaudeAccountsSetupGuideProps) {
  const { completion, currentStep, allComplete } = deriveClaudeSetupSteps(
    accounts,
    statuses,
    usage,
  );
  if (allComplete) return null;

  const step = STEPS[currentStep];
  const completedCount = completion.filter(Boolean).length;

  return (
    <div className="bg-[var(--bg-secondary)]/45 px-4 py-4">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[11px] font-medium text-[var(--text-secondary)]">
          Finish setup
        </span>
        <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
          {completedCount} of {STEPS.length} complete
        </span>
      </div>
      <div className="mt-2 flex gap-1.5" aria-hidden="true">
        {STEPS.map(({ title }, index) => (
          <div
            key={title}
            className={`h-1 flex-1 rounded-full transition-colors ${
              completion[index]
                ? "bg-[var(--accent-green)]"
                : index === currentStep
                  ? "bg-[var(--text-secondary)]"
                  : "bg-[var(--border)]"
            }`}
          />
        ))}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-[10px] font-medium tabular-nums text-[var(--text-muted)]">
          {currentStep + 1}
        </span>
        <div>
          <p className="text-[13px] font-medium text-[var(--text-primary)]">
            {step.title}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
            {step.hint}
          </p>
        </div>
      </div>
    </div>
  );
}
