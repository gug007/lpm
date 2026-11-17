import { Terminal, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

export type StatusLineTone = "neutral" | "live" | "attention" | "error";

const TONE_CLASS: Record<StatusLineTone, { text: string; dot: string }> = {
  neutral: { text: "text-[var(--text-secondary)]", dot: "bg-[var(--text-muted)]" },
  live: { text: "text-[var(--accent-green-text)]", dot: "bg-[var(--accent-green)]" },
  attention: { text: "text-[var(--accent-amber-text)]", dot: "bg-[var(--accent-amber)]" },
  error: { text: "text-[var(--accent-red-text)]", dot: "bg-[var(--accent-red)]" },
};

export interface StatusLineFrameStatus {
  label: string;
  tone: StatusLineTone;
  pulsing?: boolean;
}

// The preview card both status-line pages share: one header with what's
// selected and at most one status, the line on a terminal strip, then a note.
export function StatusLinePreviewFrame({
  selectionLabel,
  status,
  themeStyle,
  children,
  footer,
  footerIcon: FooterIcon,
  footerSpinning,
  footerAccessory,
}: {
  selectionLabel: string | null;
  status: StatusLineFrameStatus | null;
  themeStyle: CSSProperties | undefined;
  children: ReactNode;
  footer?: ReactNode;
  footerIcon?: LucideIcon;
  footerSpinning?: boolean;
  // A control for the line itself, on the right of the note.
  footerAccessory?: ReactNode;
}) {
  const tone = status ? TONE_CLASS[status.tone] : null;
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-sm">
      <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Terminal aria-hidden size={14} className="shrink-0 text-[var(--text-muted)]" />
          <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">Preview</h2>
          {selectionLabel && (
            <>
              <span aria-hidden className="text-[var(--text-muted)]">·</span>
              <span className="min-w-0 truncate text-[12px] text-[var(--text-secondary)]">
                {selectionLabel}
              </span>
            </>
          )}
        </div>
        <span
          role="status"
          aria-live="polite"
          className={`flex shrink-0 items-center gap-1.5 text-[12px] font-medium ${tone?.text ?? ""}`}
        >
          {status && tone && (
            <>
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${tone.dot} ${
                  status.pulsing ? "animate-pulse motion-reduce:animate-none" : ""
                }`}
              />
              {status.label}
            </>
          )}
        </span>
      </div>

      <div
        className={`overflow-x-auto border-t border-[var(--terminal-header-border)] px-4 py-3.5 ${
          footer || footerAccessory ? "border-b" : ""
        }`}
        style={{ ...themeStyle, background: "var(--terminal-bg)" }}
      >
        {children}
      </div>

      {(footer || footerAccessory) && (
        <div className="flex items-center gap-3 py-1.5 pl-4 pr-2 text-[12px] leading-relaxed text-[var(--text-muted)]">
          <div className="flex min-w-0 flex-1 items-start gap-2 py-1">
            {footer && FooterIcon && (
              <FooterIcon
                aria-hidden
                size={13}
                className={`mt-[3px] shrink-0 ${
                  footerSpinning ? "animate-spin motion-reduce:animate-none" : ""
                }`}
              />
            )}
            <span className="min-w-0">{footer}</span>
          </div>
          {footerAccessory}
        </div>
      )}
    </section>
  );
}
