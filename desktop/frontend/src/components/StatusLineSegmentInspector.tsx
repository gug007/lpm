import { Check, Trash2, X } from "lucide-react";
import {
  STATUS_LINE_COLORS,
  STATUS_LINE_SEGMENT_DESCRIPTIONS,
  STATUS_LINE_SEGMENT_ICONS,
  STATUS_LINE_SEGMENT_LABELS,
  statusLineColorValue,
} from "./statusLineEditorOptions";
import {
  statusLineIconError,
  statusLineTextError,
} from "./statusLineValidation";
import type { Segment } from "./statusLineTypes";

export function StatusLineSegmentInspector({
  headingId,
  segment,
  disabled,
  canRemove,
  onUpdate,
  onRemove,
  onClose,
}: {
  headingId: string;
  segment: Segment;
  disabled: boolean;
  canRemove: boolean;
  onUpdate: (patch: Partial<Segment>) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const activeColor = STATUS_LINE_COLORS.find(
    (color) => color.id === segment.color,
  );
  const textError =
    segment.id === "text" ? statusLineTextError(segment.text) : null;
  const defaultIcon = STATUS_LINE_SEGMENT_ICONS[segment.id];
  const effectiveIcon = segment.icon ?? defaultIcon;
  const iconError =
    segment.icon === undefined ? null : statusLineIconError(segment.icon);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3.5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-secondary)] text-base">
          <span
            aria-hidden
            style={{ color: statusLineColorValue(segment.color) }}
          >
            {effectiveIcon || (segment.id === "text" ? "T" : "—")}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id={headingId}
            className="text-[12px] font-semibold text-[var(--text-primary)]"
          >
            {STATUS_LINE_SEGMENT_LABELS[segment.id]} settings
          </h3>
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-[var(--text-muted)]">
            {STATUS_LINE_SEGMENT_DESCRIPTIONS[segment.id]}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={disabled || !canRemove}
            onClick={onRemove}
            aria-label={`Remove ${STATUS_LINE_SEGMENT_LABELS[segment.id]}`}
            title={canRemove ? "Remove item" : "Keep at least one item"}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--accent-red)]/10 hover:text-[var(--accent-red-text)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${STATUS_LINE_SEGMENT_LABELS[segment.id]} settings`}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {segment.id === "text" && (
        <label className="mt-4 block">
          <span className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)]">
            Text
          </span>
          <input
            value={segment.text}
            onChange={(event) => onUpdate({ text: event.target.value })}
            disabled={disabled}
            autoFocus
            aria-invalid={Boolean(textError)}
            aria-describedby={textError ? "status-line-text-error" : undefined}
            placeholder="e.g. shipping mode"
            className={`h-9 w-full rounded-lg border bg-[var(--bg-primary)] px-2.5 text-[12px] text-[var(--text-primary)] outline-none transition-colors focus:ring-1 ${
              textError
                ? "border-[var(--accent-red)] focus:ring-[var(--accent-red)]/30"
                : "border-[var(--border)] focus:border-[var(--accent-green)] focus:ring-[var(--accent-green)]/20"
            }`}
          />
          {textError && (
            <span
              id="status-line-text-error"
              role="alert"
              className="mt-1.5 block text-[10.5px] text-[var(--accent-red-text)]"
            >
              {textError}
            </span>
          )}
        </label>
      )}

      <label className="mt-4 block">
        <span className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-medium text-[var(--text-secondary)]">
          <span>Icon</span>
          <span className="text-[9.5px] font-normal text-[var(--text-muted)]">
            Clear to hide
          </span>
        </span>
        <div className="flex gap-2">
          <input
            value={effectiveIcon}
            onChange={(event) => onUpdate({ icon: event.target.value })}
            disabled={disabled}
            autoFocus={segment.id !== "text"}
            aria-label={`${STATUS_LINE_SEGMENT_LABELS[segment.id]} icon`}
            aria-invalid={Boolean(iconError)}
            aria-describedby={iconError ? "status-line-icon-error" : undefined}
            placeholder="Emoji or symbol"
            className={`h-9 min-w-0 flex-1 rounded-lg border bg-[var(--bg-primary)] px-2.5 text-center text-[15px] text-[var(--text-primary)] outline-none transition-colors focus:ring-1 ${
              iconError
                ? "border-[var(--accent-red)] focus:ring-[var(--accent-red)]/30"
                : "border-[var(--border)] focus:border-[var(--accent-green)] focus:ring-[var(--accent-green)]/20"
            }`}
          />
          <button
            type="button"
            onClick={() => onUpdate({ icon: undefined })}
            disabled={disabled || segment.icon === undefined}
            className="h-9 rounded-lg border border-[var(--border)] px-2.5 text-[10.5px] font-medium text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] disabled:cursor-not-allowed disabled:opacity-35"
          >
            Reset
          </button>
        </div>
        {iconError ? (
          <span
            id="status-line-icon-error"
            role="alert"
            className="mt-1.5 block text-[10.5px] text-[var(--accent-red-text)]"
          >
            {iconError}
          </span>
        ) : (
          <span className="mt-1.5 block text-[9.5px] text-[var(--text-muted)]">
            Use an emoji or short symbol. Reset restores the default.
          </span>
        )}
      </label>

      <fieldset className="mt-4">
        <legend className="mb-2 text-[11px] font-medium text-[var(--text-secondary)]">
          Color
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_LINE_COLORS.map((color) => {
            const active = segment.color === color.id;
            const isDefault = color.id === "default";
            return (
              <button
                key={color.id}
                type="button"
                disabled={disabled}
                onClick={() => onUpdate({ color: color.id })}
                aria-pressed={active}
                aria-label={color.label}
                title={color.label}
                className={`flex h-8 w-8 items-center justify-center rounded-full outline-none transition-[box-shadow] focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] disabled:cursor-not-allowed disabled:opacity-40 ${
                  active
                    ? "ring-2 ring-[var(--accent-green)] ring-offset-2 ring-offset-[var(--bg-primary)]"
                    : ""
                }`}
                style={{
                  background: isDefault ? "transparent" : color.swatch,
                  border: isDefault ? "1px solid var(--text-muted)" : undefined,
                }}
              >
                {active && (
                  <Check
                    size={13}
                    strokeWidth={2.5}
                    style={{
                      color: isDefault ? "var(--text-primary)" : "#fff",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-[var(--text-muted)]">
          {activeColor?.label ?? "Default"}
        </p>
      </fieldset>
    </div>
  );
}
