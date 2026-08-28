"use client";

import type { ComponentProps } from "react";
import { FOCUS_RING } from "../ui";

// The app's MobileSettingsPane carries its own toggle rather than the shared
// one: a 20px green track with a 14px knob, travelling 16px.
export function MobileToggle({
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
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-[#4ade80]" : "bg-[#333333]"
      } ${FOCUS_RING} ${className}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
