interface EmptyStateProps {
  title: string;
  body: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export function EmptyState({ title, body, icon, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      {icon && (
        <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]">
          {icon}
        </span>
      )}
      <p className="text-[14px] font-medium text-[var(--text-primary)]">{title}</p>
      <p className="mt-1 max-w-sm text-[12px] leading-snug text-[var(--text-muted)]">{body}</p>
      {children}
    </div>
  );
}
