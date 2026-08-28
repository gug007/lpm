"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { FOCUS_RING, PRESS } from "../ui";

export function DialogHeader({
  title,
  description,
  onClose,
}: {
  title: ReactNode;
  description?: ReactNode;
  onClose?: () => void;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-[#e5e5e5]">{title}</h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`-mr-1 -mt-1 rounded p-1 text-[#919191] hover:bg-[#2a2a2a] hover:text-[#e5e5e5] ${FOCUS_RING} ${PRESS}`}
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        )}
      </div>
      {description && (
        <p className="mt-2 text-[11px] leading-relaxed text-[#919191]">
          {description}
        </p>
      )}
    </>
  );
}
