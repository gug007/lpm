import type { ReactNode } from "react";

export type StatusTone = "neutral" | "success" | "attention" | "danger";

const TONES: Record<StatusTone, string> = {
  neutral: "bg-[var(--bg-active)] text-[var(--text-secondary)]",
  success: "bg-[var(--accent-green)]/12 text-[var(--accent-green)]",
  attention: "bg-[var(--accent-amber)]/14 text-[var(--accent-amber)]",
  danger: "bg-[var(--accent-red)]/12 text-[var(--accent-red)]",
};

// A state label, never a control: no border, so it can't be mistaken for a button.
export function StatusChip({
  tone = "neutral",
  dot = false,
  children,
  className = "",
}: {
  tone?: StatusTone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-1.5 text-[11px] font-medium leading-[18px] ${TONES[tone]} ${className}`}
    >
      {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
