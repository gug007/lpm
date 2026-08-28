"use client";

import type { ComponentProps } from "react";
import { X } from "lucide-react";
import { FOCUS_RING, PRESS } from "../ui";

// The close affordance a drill-down menu panel carries in its top-right corner,
// as opposed to the one DialogHeader lays out beside a dialog title.
export function MenuCloseButton({
  className = "",
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      {...props}
      type="button"
      aria-label="Close"
      className={`absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md text-[#919191] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] ${FOCUS_RING} ${PRESS} ${className}`}
    >
      <X className="h-3.5 w-3.5" strokeWidth={1.75} />
    </button>
  );
}
