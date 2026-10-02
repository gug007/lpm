interface PreviewStatusProps {
  error: string | null;
}

// What a media preview shows until it has something to draw: why it can't,
// or that it's on the way.
export function PreviewStatus({ error }: PreviewStatusProps) {
  if (!error) {
    return <div className="m-auto text-[13px] text-[var(--text-muted)]">Loading…</div>;
  }
  return (
    <div className="m-auto max-w-md px-4 text-center">
      <div className="text-[13px] text-[var(--accent-red)]">{error}</div>
      <div className="mt-1 text-[12px] text-[var(--text-muted)]">Try opening it in another app.</div>
    </div>
  );
}
