import { PencilIcon } from "../icons";

interface LocalPortFieldProps {
  editing: boolean;
  value: string;
  onChange: (value: string) => void;
  displayLabel: string;
  onDisplayClick: () => void;
  onEdit: () => void;
  onCommit: () => void;
  onCancel: () => void;
}

// LocalPortField is the shared "click label / pencil to edit / Enter to
// commit / Escape to cancel" UI used by both the active-forward and
// detected-suggestion rows. Display click semantics differ per caller
// (open URL vs. forward at the current port), so the parent supplies
// onDisplayClick instead of branching here.
export function LocalPortField({
  editing,
  value,
  onChange,
  displayLabel,
  onDisplayClick,
  onEdit,
  onCommit,
  onCancel,
}: LocalPortFieldProps) {
  if (editing) {
    return (
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={65535}
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit();
          if (e.key === "Escape") onCancel();
        }}
        className="flex-1 rounded-md border border-[var(--text-primary)] bg-[var(--bg-sidebar)] px-2 py-0.5 text-xs font-mono text-[var(--text-primary)] focus:outline-none"
        aria-label="Local port"
      />
    );
  }
  return (
    <>
      <button
        onClick={onDisplayClick}
        className="flex-1 truncate text-left font-mono text-[var(--text-primary)] hover:underline"
        title={displayLabel}
      >
        {displayLabel}
      </button>
      <button
        onClick={onEdit}
        className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] opacity-0 transition-opacity hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)] group-hover:opacity-100"
        aria-label="Change local port"
        title="Change local port"
      >
        <PencilIcon size={12} />
      </button>
    </>
  );
}
