export function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <p className="text-lg font-semibold text-[var(--text-primary)]">
          Select a project
        </p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Choose a project from the sidebar
        </p>
      </div>
    </div>
  );
}

export function EmptyStateNoProjects({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="flex max-w-sm flex-col items-center text-center">
        <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-sm">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <circle cx="13" cy="13" r="5" fill="var(--accent-green)" />
            <circle cx="24" cy="16" r="4.5" fill="var(--text-primary)" opacity="0.85" />
            <circle cx="15" cy="24" r="4.5" fill="var(--text-primary)" opacity="0.55" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
          Start a project in lpm
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          Run, stop, and switch between your local dev projects — all from one place.
        </p>
        <button
          onClick={onAdd}
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-primary)] shadow-sm transition-all hover:opacity-85 active:opacity-75"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add project
        </button>
        <p className="mt-4 text-[11px] text-[var(--text-muted)]">
          Local folder · Git repo · SSH host
        </p>
      </div>
    </div>
  );
}
