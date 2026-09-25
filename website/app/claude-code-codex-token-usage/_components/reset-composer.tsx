import { ChevronUp, Send } from "lucide-react";
import { AGENT, PROMPT } from "./reset-data";

export default function ResetComposer({ empty }: { empty: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--composer-border)] bg-[var(--composer-surface)] px-3 pb-2 pt-2.5">
      {empty ? (
        <p className="font-mono text-[12.5px] leading-relaxed text-[var(--text-muted)]">{`Send to ${AGENT}…`}</p>
      ) : (
        <p className="line-clamp-2 font-mono text-[12.5px] leading-relaxed text-[var(--text-primary)]">{PROMPT}</p>
      )}
      <div className="mt-2 flex items-center justify-end">
        <span
          aria-hidden
          className={`flex items-center rounded-lg ${
            empty
              ? "bg-[var(--composer-inert-bg)] text-[var(--text-muted)]"
              : "bg-[var(--accent-blue)] text-[var(--bg-primary)] shadow-[0_2px_12px_-2px_color-mix(in_srgb,var(--accent-blue)_60%,transparent)]"
          }`}
        >
          <span className="flex h-7 items-center rounded-l-lg pl-2.5 pr-2">
            <Send className="h-3.5 w-3.5 rotate-45" strokeWidth={1.75} />
          </span>
          <span className={`h-3.5 w-px ${empty ? "bg-[var(--composer-border)]" : "bg-[var(--bg-primary)]/20"}`} />
          <span className="flex h-7 items-center rounded-r-lg pl-1.5 pr-2">
            <ChevronUp className="h-3 w-3" strokeWidth={2} />
          </span>
        </span>
      </div>
    </div>
  );
}
