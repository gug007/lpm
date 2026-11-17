export function NotesDaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-3 pb-1 pt-3">
      <span className="text-[11px] font-medium text-[var(--text-muted)]">{label}</span>
      <span className="h-px flex-1 bg-[var(--border)]" />
    </div>
  );
}
