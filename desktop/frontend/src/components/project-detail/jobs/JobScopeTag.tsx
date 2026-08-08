interface JobScopeTagProps {
  // Which projects the job runs in — a name, a count, or "No project".
  label: string;
  // The job is declared in the repo's own config file, so it isn't lpm's to
  // remove.
  inRepo?: boolean;
}

// Where a job runs, as a quiet tag beside its name: the Automations list is
// flat, so every row has to say which projects it belongs to.
export function JobScopeTag({ label, inRepo }: JobScopeTagProps) {
  return (
    <span className="inline-flex max-w-[14rem] shrink-0 items-center gap-1 rounded-full border border-[var(--border)] px-2 py-[1px] text-[10px] font-medium text-[var(--text-muted)]">
      <span className="truncate">{label}</span>
      {inRepo && <span className="shrink-0 opacity-60">· in repo</span>}
    </span>
  );
}
