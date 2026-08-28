"use client";

import type { ReactNode } from "react";
import { FOCUS_RING } from "../ui";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
};

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  fullWidth = false,
  ariaLabel,
  className = "",
}: {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  fullWidth?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`flex rounded-lg border border-[#2e2e2e] bg-[#242424] p-0.5 ${
        fullWidth ? "w-full" : "inline-flex"
      } ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            disabled={opt.disabled}
            aria-pressed={active}
            className={`flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40 ${
              fullWidth ? "flex-1" : ""
            } ${
              active
                ? "bg-[#333333] text-[#e5e5e5]"
                : "text-[#919191] hover:bg-[#2a2a2a] hover:text-[#b3b3b3]"
            } ${FOCUS_RING}`}
          >
            {opt.icon && (
              <span className={active ? "" : "opacity-80"}>{opt.icon}</span>
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
