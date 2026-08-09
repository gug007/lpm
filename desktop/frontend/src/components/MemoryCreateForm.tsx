interface MemoryCreateFormProps {
  title: string;
  // The slug `title` becomes — the id agents continue the session by, and the
  // file it lands in. Empty while the title has nothing usable in it yet.
  slug: string;
  // Whose memory folder the file goes to: a duplicate writes to its original's.
  owner: string;
  saving: boolean;
  onChange: (title: string) => void;
  onSubmit: () => void;
}

// Starting a session by hand from the Memory tab, when an agent hasn't written
// one yet. The path is shown as it will be, so the id is no surprise later.
export function MemoryCreateForm({
  title,
  slug,
  owner,
  saving,
  onChange,
  onSubmit,
}: MemoryCreateFormProps) {
  return (
    <div className="flex min-h-0 flex-1 justify-center px-6 pt-14">
      <div className="w-full max-w-md">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          New session
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="flex items-center gap-2"
        >
          <input
            autoFocus
            value={title}
            onChange={(e) => onChange(e.target.value)}
            placeholder="What is this session about?"
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-sidebar)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-purple)]/50 focus:outline-none"
          />
          <button
            type="submit"
            disabled={saving || !slug}
            className="rounded-lg bg-[var(--text-primary)] px-3 py-2 text-sm font-medium text-[var(--bg-primary)] transition-opacity disabled:opacity-40 hover:opacity-85"
          >
            Create
          </button>
        </form>
        {slug && (
          <div className="mt-2 font-mono text-[11px] text-[var(--text-muted)]">
            ~/.lpm/memory/{owner}/{slug}.md
          </div>
        )}
      </div>
    </div>
  );
}
