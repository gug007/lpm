import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export function SettingsSection({
  id,
  title,
  description,
  children,
  collapsible = false,
  collapsed = false,
  onToggle,
  summary,
}: {
  id?: string;
  title?: string;
  description?: string;
  children: ReactNode;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  summary?: ReactNode;
}) {
  if (collapsible && collapsed) {
    return (
      <div className="mt-6" data-settings-row={id}>
        <button
          type="button"
          onClick={onToggle}
          className="group flex w-full items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)]"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-[var(--text-primary)]">
              {title}
            </span>
            {description && (
              <span className="block text-[11px] text-[var(--text-muted)]">
                {description}
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-2 text-[var(--text-muted)]">
            {summary && <span className="text-[11px]">{summary}</span>}
            <ChevronRight
              size={14}
              className="transition-colors group-hover:text-[var(--text-primary)]"
            />
          </span>
        </button>
      </div>
    );
  }
  const content = (
    <>
      {description && (
        <p className="pb-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
          {description}
        </p>
      )}
      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
        {children}
      </div>
    </>
  );
  return (
    <div className="mt-6 space-y-2" data-settings-row={id}>
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          className="group flex w-full items-center gap-1.5 text-[13px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <span>{title}</span>
          <ChevronRight size={14} className="rotate-90 transition-transform group-hover:translate-y-0.5" />
        </button>
      ) : (
        title && (
          <h2 className="px-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {title}
          </h2>
        )
      )}
      {collapsible ? (
        <div className="field-reveal space-y-2">{content}</div>
      ) : (
        content
      )}
    </div>
  );
}
