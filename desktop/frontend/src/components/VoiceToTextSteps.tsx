import { CheckIcon } from "./icons";

export interface VoiceToTextStep {
  text: string;
  state: "todo" | "now" | "done";
  note?: string;
}

/** The install dialog's numbered steps, each marked to do, under way or done. */
export function VoiceToTextSteps({ steps }: { steps: VoiceToTextStep[] }) {
  return (
    <ol className="mt-5 space-y-3 px-5">
      {steps.map((step, i) => (
        <li key={step.text} className="relative flex gap-3">
          {i < steps.length - 1 && (
            <span aria-hidden className="absolute -bottom-3 left-[9.5px] top-5 w-px bg-[var(--border)]" />
          )}
          <span
            className={`relative z-10 mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium tabular-nums [&>svg]:h-3 [&>svg]:w-3 ${
              step.state === "done"
                ? "bg-[var(--accent-green)]/15 text-[var(--accent-green)] ring-1 ring-inset ring-[var(--accent-green)]/30"
                : step.state === "now"
                  ? "border-2 border-[var(--accent-cyan)] bg-[var(--bg-primary)] text-[var(--accent-cyan)]"
                  : "border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-muted)]"
            }`}
          >
            {step.state === "done" ? <CheckIcon /> : i + 1}
          </span>
          <span
            className={`flex min-w-0 flex-1 items-baseline gap-2 pt-px text-[13px] leading-snug ${
              step.state === "now" ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
            }`}
          >
            <span className="min-w-0 flex-1">{step.text}</span>
            {step.note && <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{step.note}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
