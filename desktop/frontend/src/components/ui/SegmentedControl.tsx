import type { ReactNode } from "react";
import { Tooltip } from "./Tooltip";

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  tooltip?: ReactNode;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  fullWidth?: boolean;
  className?: string;
  variant?: "outlined" | "subtle";
  ariaLabel?: string;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  fullWidth = false,
  className = "",
  variant = "outlined",
  ariaLabel,
}: SegmentedControlProps<T>) {
  const fullWidthClass = fullWidth ? "w-full" : "";
  const containerClass =
    variant === "subtle"
      ? "rounded-lg bg-[var(--bg-secondary)]/70 p-0.5"
      : "rounded-md border border-[var(--border)] p-0.5";
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`flex ${containerClass} ${fullWidthClass} ${className}`}
    >
      {options.map((opt) => {
        const button = (
          <button
            type="button"
            onClick={() => onChange(opt.value)}
            disabled={opt.disabled}
            aria-pressed={value === opt.value}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${fullWidthClass} ${
              value === opt.value
                ? variant === "subtle"
                  ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-[0_1px_2px_rgba(0,0,0,0.16)]"
                  : "bg-[var(--bg-active)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--text-muted)]"
            }`}
          >
            {opt.label}
          </button>
        );
        return (
          <span key={opt.value} className={fullWidth ? "flex-1" : ""}>
            {opt.tooltip ? (
              <Tooltip content={opt.tooltip} side="bottom" wide>
                {button}
              </Tooltip>
            ) : (
              button
            )}
          </span>
        );
      })}
    </div>
  );
}
