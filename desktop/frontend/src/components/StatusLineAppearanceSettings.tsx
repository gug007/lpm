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
      className="mt-4 border-t border-[var(--border)] pt-4"
      aria-labelledby="status-line-appearance-heading"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--bg-primary)] text-[var(--text-muted)]">
          <SlidersHorizontal size={14} />
        </span>
        <div>
          <h3
            id="status-line-appearance-heading"
            className="text-[12px] font-semibold text-[var(--text-primary)]"
          >
            Appearance
          </h3>
          <p className="text-[10.5px] text-[var(--text-muted)]">
            Style the entire line.
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
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

      <div className={`mt-3 grid gap-3 ${showMeter ? "lg:grid-cols-2" : ""}`}>
        <fieldset className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/60 p-3">
          <legend className="px-1 text-[11px] font-medium text-[var(--text-secondary)]">
            Separator
          </legend>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
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
              className={`h-9 w-12 rounded-lg border bg-[var(--bg-primary)] px-2 text-center font-mono text-[12px] text-[var(--text-primary)] outline-none focus:ring-1 ${
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
                className={`flex h-9 w-9 items-center justify-center rounded-lg border font-mono text-[12px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] ${
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
          <fieldset className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/60 p-3">
            <legend className="px-1 text-[11px] font-medium text-[var(--text-secondary)]">
              Usage display
            </legend>
            <div className="mt-1 grid grid-cols-2 gap-1.5">
              {STATUS_LINE_METER_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ ...spec, meterStyle: style.id })}
                  aria-pressed={spec.meterStyle === style.id}
                  className={`flex min-h-10 items-center justify-between gap-2 rounded-lg border px-2.5 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] ${
                    spec.meterStyle === style.id
                      ? "border-[var(--accent-green)] bg-[var(--accent-green)]/10 text-[var(--text-primary)]"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  <span className="text-[10.5px] font-medium">
                    {style.label}
                  </span>
                  <span className="font-mono text-[9.5px] opacity-75">
                    {style.sample}
                  </span>
                </button>
              ))}
            </div>
            {spec.meterStyle !== "percent" && (
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
                <span>
                  <span className="block text-[11px] font-medium text-[var(--text-secondary)]">
                    Meter width
                  </span>
                  <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">
                    Characters per meter
                  </span>
                </span>
                <StatusLineStepper
                  value={spec.meterWidth}
                  min={3}
                  max={16}
                  disabled={disabled}
                  onChange={(meterWidth) => onChange({ ...spec, meterWidth })}
                />
              </div>
            )}
          </fieldset>
        )}
      </div>
    </section>
  );
}
