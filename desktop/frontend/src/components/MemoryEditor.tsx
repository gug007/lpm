interface MemoryEditorProps {
  draft: string;
  // What the file read when editing started: while the draft still matches it
  // there is nothing to save.
  baseline: string;
  saving: boolean;
  zoom: number;
  onChange: (text: string) => void;
  onCancel: () => void;
  onSave: () => void;
}

const EDITOR_FONT_PX = 13;

// The Memory tab's raw-markdown editor. Agents write the same file, so the save
// is a compare-and-swap the pane runs against `baseline`.
export function MemoryEditor({
  draft,
  baseline,
  saving,
  zoom,
  onChange,
  onCancel,
  onSave,
}: MemoryEditorProps) {
  const dirty = draft !== baseline;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <textarea
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && (e.key === "Enter" || e.key.toLowerCase() === "s")) {
            e.preventDefault();
            if (!saving && dirty) onSave();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        spellCheck={false}
        autoFocus
        style={{ fontSize: EDITOR_FONT_PX * zoom, lineHeight: 1.7 }}
        className="min-h-0 w-full flex-1 resize-none bg-[var(--bg-primary)] px-8 py-5 font-mono text-[var(--text-primary)] focus:outline-none"
      />
      <div className="flex items-center gap-2 border-t border-[var(--border)] px-4 py-2.5">
        <span className="flex-1 text-[11px] text-[var(--text-muted)]">⌘⏎ save · esc cancel</span>
        <button
          onClick={onCancel}
          className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving || !dirty}
          className="rounded-md bg-[var(--text-primary)] px-2.5 py-1 text-xs font-medium text-[var(--bg-primary)] transition-opacity disabled:opacity-40 hover:opacity-85"
        >
          Save
        </button>
      </div>
    </div>
  );
}
