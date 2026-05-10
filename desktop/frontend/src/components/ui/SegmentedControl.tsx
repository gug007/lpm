import type { ReactNode } from "react";
import { Tooltip } from "./Tooltip";

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  tooltip?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="flex rounded-md border border-[var(--border)] p-0.5">
      {options.map((opt) => {
        const button = (
          <button
            onClick={() => onChange(opt.value)}
            className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
              value === opt.value
                ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {opt.label}
          </button>
        );
        return opt.tooltip ? (
          <Tooltip key={opt.value} content={opt.tooltip} side="bottom" wide>
            {button}
          </Tooltip>
        ) : (
          <span key={opt.value}>{button}</span>
        );
      })}
    </div>
  );
}
