import {
  STATUS_LINE_SEGMENT_DEFAULT_LABELS,
  STATUS_LINE_SEGMENT_LABELS,
} from "./statusLineEditorOptions";
import { statusLineLabelError } from "./statusLineValidation";
import type { Segment } from "./statusLineTypes";

export function StatusLineSegmentLabelField({
  segment,
  disabled,
  onUpdate,
}: {
  segment: Segment;
  disabled: boolean;
  onUpdate: (patch: Partial<Segment>) => void;
}) {
  const name = STATUS_LINE_SEGMENT_LABELS[segment.id];
  const defaultLabel = STATUS_LINE_SEGMENT_DEFAULT_LABELS[segment.id];
  const effectiveLabel = segment.label ?? defaultLabel;
  const error = statusLineLabelError(effectiveLabel);
  const errorId = `status-line-${segment.id}-label-error`;

  return (
    <label className="mt-4 block">
      <span className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-medium text-[var(--text-secondary)]">
        <span>Label</span>
        <span className="text-[9.5px] font-normal text-[var(--text-muted)]">
          Clear to hide
        </span>
      </span>
      <div className="flex gap-2">
        <input
          value={effectiveLabel}
          onChange={(event) => onUpdate({ label: event.target.value })}
          disabled={disabled}
          autoFocus
          aria-label={`${name} label`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          placeholder="e.g. repo"
          className={`h-9 min-w-0 flex-1 rounded-lg border bg-[var(--bg-primary)] px-2.5 text-[12px] text-[var(--text-primary)] outline-none transition-colors focus:ring-1 ${
            error
              ? "border-[var(--accent-red)] focus:ring-[var(--accent-red)]/30"
              : "border-[var(--border)] focus:border-[var(--accent-green)] focus:ring-[var(--accent-green)]/20"
          }`}
        />
        <button
          type="button"
          onClick={() => onUpdate({ label: undefined })}
          disabled={disabled || segment.label === undefined}
          aria-label={`Reset ${name} label`}
          className="h-9 rounded-lg border border-[var(--border)] px-2.5 text-[10.5px] font-medium text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] disabled:cursor-not-allowed disabled:opacity-35"
        >
          Reset
        </button>
      </div>
      {error ? (
        <span
          id={errorId}
          role="alert"
          className="mt-1.5 block text-[10.5px] text-[var(--accent-red-text)]"
        >
          {error}
        </span>
      ) : (
        <span className="mt-1.5 block text-[9.5px] text-[var(--text-muted)]">
          {defaultLabel
            ? `Reset restores “${defaultLabel}”.`
            : "Shown before the value when set."}
        </span>
      )}
    </label>
  );
}
