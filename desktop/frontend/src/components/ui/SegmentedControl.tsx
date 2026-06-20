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
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  fullWidth = false,
  className = "",
}: SegmentedControlProps<T>) {
  const fullWidthClass = fullWidth ? "w-full" : "";
  return (
    <div
      className={`flex rounded-md border border-[var(--border)] p-0.5 ${fullWidthClass} ${className}`}
    >
      {options.map((opt) => {
        const button = (
          <button
            type="button"
            onClick={() => onChange(opt.value)}
            disabled={opt.disabled}
            className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${fullWidthClass} ${
              value === opt.value
                ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] disabled:opacity-40 disabled:hover:text-[var(--text-muted)]"
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
