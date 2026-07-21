import { SlidersHorizontal } from "lucide-react";
import {
  STATUS_LINE_METER_STYLES,
  STATUS_LINE_SEPARATORS,
} from "./statusLineEditorOptions";
import { statusLineSeparatorError } from "./statusLineValidation";
import type { CustomSpec } from "./statusLineTypes";
import { StatusLineStepper } from "./StatusLineStepper";
import { StatusLineToggle } from "./StatusLineToggle";

export function StatusLineAppearanceSettings({
  spec,
  disabled,
  onChange,
}: {
  spec: CustomSpec;
  disabled: boolean;
  onChange: (spec: CustomSpec) => void;
}) {
  const hasBranch = spec.segments.some((segment) => segment.id === "branch");
  const showMeter = spec.segments.some(
    (segment) => segment.id === "five" || segment.id === "seven",
  );
  const separatorError = statusLineSeparatorError(spec.separator);

  return (
    <section
      className="mt-3 border-t border-[var(--border)] pt-3"
      aria-labelledby="status-line-appearance-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--bg-primary)] text-[var(--text-muted)]">
            <SlidersHorizontal size={13} />
          </span>
          <h3
            id="status-line-appearance-heading"
            className="text-[12px] font-semibold text-[var(--text-primary)]"
          >
            Appearance
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusLineToggle
            checked={spec.icons}
            disabled={disabled}
            label="Show icons"
            description="Add a visual cue to each item"
            onChange={(icons) => onChange({ ...spec, icons })}
          />
          {hasBranch && (
            <StatusLineToggle
              checked={spec.gitStatus}
              disabled={disabled}
              label="Show Git status"
              description="Mark uncommitted branch changes"
              onChange={(gitStatus) => onChange({ ...spec, gitStatus })}
            />
          )}
        </div>
      </div>

      <div
        className={`mt-2 grid items-start gap-2 ${showMeter ? "@min-[680px]:grid-cols-[minmax(240px,0.7fr)_minmax(0,1.3fr)]" : ""}`}
      >
        <fieldset className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/60 p-2">
          <legend className="sr-only">Separator</legend>
          <div className="mb-1.5 text-[10.5px] font-medium text-[var(--text-secondary)]">
            Separator
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <input
              value={spec.separator}
              onChange={(event) =>
                onChange({ ...spec, separator: event.target.value })
              }
              disabled={disabled}
              aria-label="Custom separator"
              aria-invalid={Boolean(separatorError)}
              aria-describedby={
                separatorError ? "status-line-separator-error" : undefined
              }
              className={`h-8 w-10 rounded-md border bg-[var(--bg-primary)] px-1.5 text-center font-mono text-[11px] text-[var(--text-primary)] outline-none focus:ring-1 ${
                separatorError
                  ? "border-[var(--accent-red)] focus:ring-[var(--accent-red)]/30"
                  : "border-[var(--border)] focus:border-[var(--accent-green)] focus:ring-[var(--accent-green)]/20"
              }`}
            />
            {STATUS_LINE_SEPARATORS.map((separator) => (
              <button
                key={separator}
                type="button"
                onClick={() => onChange({ ...spec, separator })}
                disabled={disabled}
                aria-pressed={spec.separator === separator}
                aria-label={`Use ${separator} as separator`}
                className={`flex h-8 w-8 items-center justify-center rounded-md border font-mono text-[11px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] ${
                  spec.separator === separator
                    ? "border-[var(--accent-green)] bg-[var(--accent-green)]/10 text-[var(--text-primary)]"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                }`}
              >
                {separator}
              </button>
            ))}
          </div>
          {separatorError && (
            <p
              id="status-line-separator-error"
              role="alert"
              className="mt-1.5 text-[10.5px] text-[var(--accent-red-text)]"
            >
              {separatorError}
            </p>
          )}
        </fieldset>

        {showMeter && (
          <fieldset className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/60 p-2">
            <legend className="sr-only">Usage display</legend>
            <div className="mb-1.5 flex min-h-8 items-center justify-between gap-2">
              <span className="text-[10.5px] font-medium text-[var(--text-secondary)]">
                Usage display
              </span>
              {spec.meterStyle !== "percent" && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--text-muted)]">
                    Meter width
                  </span>
                  <StatusLineStepper
                    value={spec.meterWidth}
                    min={3}
                    max={16}
                    disabled={disabled}
                    onChange={(meterWidth) =>
                      onChange({ ...spec, meterWidth })
                    }
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1 @min-[760px]:grid-cols-4">
              {STATUS_LINE_METER_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ ...spec, meterStyle: style.id })}
                  aria-pressed={spec.meterStyle === style.id}
                  className={`flex h-8 min-w-0 items-center justify-between gap-1.5 rounded-md border px-2 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] ${
                    spec.meterStyle === style.id
                      ? "border-[var(--accent-green)] bg-[var(--accent-green)]/10 text-[var(--text-primary)]"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  <span className="truncate text-[10px] font-medium">
                    {style.label}
                  </span>
                  <span className="shrink-0 font-mono text-[9px] opacity-70">
                    {style.sample}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </div>
    </section>
  );
}
