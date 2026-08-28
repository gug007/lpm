"use client";

import type { ReactNode } from "react";
import { FOCUS_RING, PRESS } from "./ui";

// The square icon button used across the terminal header chrome. Mirrors the
// app's terminal/IconBtn: no tooltip of its own, so callers wrap it.
export function IconBtn({
  onClick,
  ariaLabel,
  active,
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`flex shrink-0 items-center justify-center rounded p-1 [&>svg]:h-3.5 [&>svg]:w-3.5 ${
        active
          ? "bg-[rgba(255,255,255,0.1)] text-[#e5e5e5]"
          : "text-[#8e8e8e] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#e5e5e5]"
      } ${PRESS} ${FOCUS_RING}`}
    >
      {children}
    </button>
  );
}
