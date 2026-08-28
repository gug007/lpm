"use client";

import type { ComponentProps } from "react";
import { FOCUS_RING } from "../ui";

// Geometry and on-colour from the app's components/ui/Switch.tsx: an 18px track
// with a 12px knob inset 3px, travelling 14px. Cyan is this control's single
// accent moment — the green toggles belong to Settings and the mobile pane.
export function Switch({
  checked,
  onChange,
  disabled,
  className = "",
  ...props
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
} & Omit<ComponentProps<"button">, "onChange" | "children">) {
  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        checked ? "bg-[#22d3ee]" : "bg-[#333333]"
      } ${FOCUS_RING} ${className}`}
    >
      <span
        className={`absolute left-[3px] top-[3px] h-3 w-3 rounded-full bg-white transition-transform ${
          checked ? "translate-x-3.5" : ""
        }`}
      />
    </button>
  );
}
