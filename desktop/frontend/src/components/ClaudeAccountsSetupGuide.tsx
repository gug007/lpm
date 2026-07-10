import type { ClaudeAccount } from "../types";
import type { ClaudeAccountStatus } from "../store/accounts";
import { deriveClaudeSetupSteps } from "../claudeSetupSteps";
import { CheckIcon } from "./icons";

interface ClaudeAccountsSetupGuideProps {
  accounts: ClaudeAccount[];
  statuses: Record<string, ClaudeAccountStatus>;
  usage: Record<string, string[]>;
  onAddAccount: () => void;
  onSignIn: (account: ClaudeAccount) => void;
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
  onAddAccount,
  onSignIn,
}: ClaudeAccountsSetupGuideProps) {
  const { completion, currentStep, allComplete } = deriveClaudeSetupSteps(
    accounts,
    statuses,
    usage,
  );
  if (allComplete) return null;

  const firstSignedOut = accounts.find((a) => !(statuses[a.id]?.signedIn ?? false));

  return (
    <div className="px-4 py-3">
      {STEPS.map((step, i) => {
        const complete = completion[i];
        const isCurrent = i === currentStep;
        const isLast = i === STEPS.length - 1;
        return (
          <div key={step.title} className="flex gap-3">
            <div className="flex flex-col items-center">
              <StepCircle index={i} complete={complete} />
              {!isLast && <div className="w-px flex-1 bg-[var(--border)]" />}
            </div>
            <div className={isLast ? "" : "pb-4"}>
              <div className="flex items-center gap-2 leading-[18px]">
                <span
                  className={`text-[13px] ${
                    isCurrent ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
                  }`}
                >
                  {step.title}
                </span>
                {isCurrent && i === 0 && (
                  <StepAction label="Add" onClick={onAddAccount} />
                )}
                {isCurrent && i === 1 && firstSignedOut && (
                  <StepAction label="Sign in" onClick={() => onSignIn(firstSignedOut)} />
                )}
              </div>
              {isCurrent && (
                <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
                  {step.hint}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StepCircle({ index, complete }: { index: number; complete: boolean }) {
  if (complete) {
    return (
      <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[var(--accent-green)] text-white">
        <CheckIcon />
      </div>
    );
  }
  return (
    <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[var(--border)] text-[10px] tabular-nums text-[var(--text-muted)]">
      {index + 1}
    </div>
  );
}

function StepAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[11px] font-medium text-[var(--accent-cyan)] transition-opacity hover:opacity-80"
    >
      {label}
    </button>
  );
}
