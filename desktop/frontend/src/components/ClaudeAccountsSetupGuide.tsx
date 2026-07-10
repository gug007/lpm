import { useEffect, useState } from "react";
import type { ClaudeAccount } from "../types";
import type { ClaudeAccountStatus } from "../store/accounts";
import { deriveClaudeSetupSteps } from "../claudeSetupSteps";
import { CheckIcon } from "./icons";

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

  return (
    <div className="px-4 py-3">
      {STEPS.map((step, i) => {
        const complete = completion[i];
        const isCurrent = i === currentStep;
        const isLast = i === STEPS.length - 1;
        const reserveHint = !isLast || isCurrent;
        return (
          <div key={step.title} className="flex gap-3">
            <div className="flex flex-col items-center">
              <StepCircle index={i} complete={complete} isCurrent={isCurrent} />
              {!isLast && (
                <div className="my-1 w-px flex-1 bg-[var(--border)]" />
              )}
            </div>
            <div className={isLast ? "" : "pb-3"}>
              <div className="flex h-[18px] items-center">
                <span
                  className={`text-[13px] ${
                    isCurrent
                      ? "font-medium text-[var(--text-primary)]"
                      : complete
                        ? "text-[var(--text-secondary)]"
                        : "text-[var(--text-muted)]"
                  }`}
                >
                  {step.title}
                </span>
              </div>
              {reserveHint && (
                <div className="mt-0.5 min-h-[16px]">
                  {isCurrent && (
                    <p className="text-[11px] leading-[16px] text-[var(--text-muted)]">
                      {step.hint}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StepCircle({
  index,
  complete,
  isCurrent,
}: {
  index: number;
  complete: boolean;
  isCurrent: boolean;
}) {
  if (complete) {
    return <CompletedCircle />;
  }
  if (isCurrent) {
    return (
      <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[var(--bg-active)] text-[10px] font-medium tabular-nums text-[var(--text-primary)]">
        {index + 1}
      </div>
    );
  }
  return (
    <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[var(--border)] text-[10px] tabular-nums text-[var(--text-muted)]">
      {index + 1}
    </div>
  );
}

function CompletedCircle() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-secondary)]">
      <span
        className={`transition duration-200 ease-out [&>svg]:h-[11px] [&>svg]:w-[11px] motion-reduce:transition-none ${
          shown ? "scale-100 opacity-100" : "scale-50 opacity-0"
        }`}
      >
        <CheckIcon />
      </span>
    </div>
  );
}
