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
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-secondary)]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 10v6M9 13h6" />
            <path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9z" />
          </svg>
        </div>
        <p className="text-lg font-semibold text-[var(--text-primary)]">
          No projects yet
        </p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Add your first project to get started
        </p>
        <button
          onClick={onAdd}
          className="mt-4 rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-85"
        >
          Add project
        </button>
      </div>
    </div>
  );
}
