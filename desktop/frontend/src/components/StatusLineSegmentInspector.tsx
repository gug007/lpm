import { Check, MousePointer2, Trash2 } from "lucide-react";
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
  segment,
  disabled,
  canRemove,
  onUpdate,
  onRemove,
}: {
  segment: Segment | undefined;
  disabled: boolean;
  canRemove: boolean;
  onUpdate: (patch: Partial<Segment>) => void;
  onRemove: () => void;
}) {
  if (!segment) {
    return (
      <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-primary)]/50 px-5 text-center">
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-secondary)] text-[var(--text-muted)]">
          <MousePointer2 size={18} />
        </span>
        <p className="text-[12px] font-medium text-[var(--text-secondary)]">
          Select an item to style it
        </p>
        <p className="mt-1 max-w-44 text-[11px] leading-relaxed text-[var(--text-muted)]">
          Change its color, edit custom text, or remove it from the line.
        </p>
      </div>
    );
  }

  const textError =
    segment.id === "text" ? statusLineTextError(segment.text) : null;
  const defaultIcon = STATUS_LINE_SEGMENT_ICONS[segment.id];
  const effectiveIcon = segment.icon ?? defaultIcon;
  const iconError =
    segment.icon === undefined ? null : statusLineIconError(segment.icon);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/70 p-3.5">
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
          <h3 className="text-[12px] font-semibold text-[var(--text-primary)]">
            {STATUS_LINE_SEGMENT_LABELS[segment.id]} settings
          </h3>
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-[var(--text-muted)]">
            {STATUS_LINE_SEGMENT_DESCRIPTIONS[segment.id]}
          </p>
        </div>
        <button
          type="button"
          disabled={disabled || !canRemove}
          onClick={onRemove}
          aria-label={`Remove ${STATUS_LINE_SEGMENT_LABELS[segment.id]}`}
          title={canRemove ? "Remove item" : "Keep at least one item"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--accent-red)]/10 hover:text-[var(--accent-red-text)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Trash2 size={14} />
        </button>
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
        <div className="grid grid-cols-2 gap-1.5">
          {STATUS_LINE_COLORS.map((color) => {
            const active = segment.color === color.id;
            return (
              <button
                key={color.id}
                type="button"
                disabled={disabled}
                onClick={() => onUpdate({ color: color.id })}
                aria-pressed={active}
                className={`flex min-h-8 items-center gap-1.5 rounded-lg border px-2 text-left text-[10.5px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] ${
                  active
                    ? "border-[var(--accent-green)] bg-[var(--accent-green)]/10 text-[var(--text-primary)]"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    background:
                      color.id === "default" ? "transparent" : color.swatch,
                    border:
                      color.id === "default"
                        ? "1px solid var(--text-muted)"
                        : undefined,
                  }}
                />
                <span className="min-w-0 flex-1 truncate">{color.label}</span>
                {active && (
                  <Check
                    size={10}
                    className="shrink-0 text-[var(--accent-green-text)]"
                  />
                )}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
