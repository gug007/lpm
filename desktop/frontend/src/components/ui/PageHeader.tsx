import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";

export interface PageBack {
  label: string;
  onClick: () => void;
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  back,
  badge,
  actions,
  className = "mb-2",
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  back?: PageBack;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={className}>
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && <Icon size={18} strokeWidth={1.9} className="shrink-0 text-[var(--text-secondary)]" />}
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
          {back && (
            <>
              <button
                type="button"
                onClick={back.onClick}
                title={`Back to ${back.label}`}
                className="-mx-1 shrink-0 rounded-md px-1 text-[19px] font-semibold tracking-tight text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                {back.label}
              </button>
              <ChevronRight size={16} strokeWidth={2.2} className="shrink-0 text-[var(--text-muted)]" />
            </>
          )}
          <h1 className="min-w-0 truncate text-[19px] font-semibold tracking-tight text-[var(--text-primary)]">
            {title}
          </h1>
        </nav>
        {badge}
        {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {description && (
        <p className="mt-1.5 max-w-xl text-[12px] leading-relaxed text-[var(--text-muted)]">{description}</p>
      )}
    </header>
  );
}
