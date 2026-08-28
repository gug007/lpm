"use client";

import type { ComponentProps } from "react";
import { FOCUS_RING } from "../ui";

// The settings pane runs a larger toggle than the one modals use — a 22px track
// with an 18px knob — matching the app's Settings.tsx control.
export function SettingsToggle({
  checked,
  onChange,
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
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors duration-200 ease-out ${
        checked ? "bg-[#4ade80]" : "bg-[#333333]"
      } ${FOCUS_RING} ${className}`}
    >
      <span
        className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition-transform duration-200 ease-out ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
