interface ToolkitSourceProps {
  draft: string;
  baseline: string;
  editable: boolean;
  saving: boolean;
  onChange: (text: string) => void;
  onSave: () => void;
  onRevert: () => void;
}

const EDITOR_FONT_PX = 12;

// The raw file. Agents rewrite these while the pane is open, so the save is a
// compare-and-swap against `baseline` — a "modified" rejection means someone
// else got there first and the pane reloads rather than clobbering.
export function ToolkitSource({
  draft,
  baseline,
  editable,
  saving,
  onChange,
  onSave,
  onRevert,
}: ToolkitSourceProps) {
  const dirty = draft !== baseline;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <textarea
        value={draft}
        readOnly={!editable}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            if (editable && !saving && dirty) onSave();
          }
        }}
        spellCheck={false}
        style={{ fontSize: EDITOR_FONT_PX, lineHeight: 1.6 }}
        className="min-h-0 w-full flex-1 resize-none bg-[var(--bg-primary)] px-5 py-4 font-mono text-[var(--text-primary)] focus:outline-none"
      />
      <div className="flex items-center gap-2 border-t border-[var(--border)] px-4 py-2">
        <span className="flex-1 text-[11px] text-[var(--text-muted)]">
          {editable
            ? "⌘S save"
            : "Read-only — another tool owns this file's format. Change it with the agent's own command."}
        </span>
        {editable && dirty && (
          <>
            <button
              onClick={onRevert}
              className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              Revert
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="rounded-md bg-[var(--text-primary)] px-2.5 py-1 text-xs font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85 disabled:opacity-40"
            >
              Save
            </button>
          </>
        )}
      </div>
    </div>
  );
}
