import type { ReactNode } from "react";

const TONES = {
  error: {
    box: "border-[var(--accent-red)]/30 bg-[var(--accent-red)]/8 text-[var(--accent-red-text)]",
    button: "border-[var(--accent-red)]/30 hover:bg-[var(--accent-red)]/10 focus-visible:ring-[var(--accent-red)]",
  },
  warning: {
    box: "border-[var(--accent-amber)]/30 bg-[var(--accent-amber)]/8 text-[var(--accent-amber-text)]",
    button: "border-[var(--accent-amber)]/30 hover:bg-[var(--accent-amber)]/10 focus-visible:ring-[var(--accent-amber)]",
  },
} as const;

// One problem on a status-line page: what went wrong, and either a way to act
// on it or the raw error behind "Show details".
export function StatusLineAlert({
  tone = "error",
  action,
  details,
  children,
}: {
  tone?: keyof typeof TONES;
  action?: { label: string; onClick: () => void; disabled?: boolean };
  details?: string;
  children: ReactNode;
}) {
  const colors = TONES[tone];
  return (
    <div
      role="alert"
      title={details}
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed ${colors.box}`}
    >
      <div className="min-w-0 flex-1">
        {children}
        {details && (
          <details className="mt-1 select-text text-[11px] opacity-80">
            <summary className="w-fit cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-current">
              Show details
            </summary>
            <p className="mt-1 break-words">{details}</p>
          </details>
        )}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          className={`h-7 shrink-0 rounded-lg border px-2.5 font-medium outline-none transition-colors focus-visible:ring-1 disabled:opacity-40 ${colors.button}`}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
