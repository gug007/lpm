"use client";

import type { ReactNode } from "react";
import { Tooltip } from "./tooltip";
import { FOCUS_RING, PRESS } from "./ui";

/** One of the small controls in the composer's footer row. */
export function ComposerIconButton({
  label,
  tooltip,
  onClick,
  disabled,
  children,
}: {
  label: string;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip content={tooltip} delay={500}>
      <button
        type="button"
        aria-label={label}
        // Don't pull focus off the field, so the caret stays where it was.
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        disabled={disabled}
        className={`flex h-7 w-7 items-center justify-center rounded-lg text-[#8e8e8e] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#cccccc] disabled:pointer-events-none disabled:opacity-40 ${PRESS} ${FOCUS_RING}`}
      >
        {children}
      </button>
    </Tooltip>
  );
}
