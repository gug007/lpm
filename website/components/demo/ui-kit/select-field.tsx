"use client";

import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { FOCUS_RING } from "../ui";

export function SelectField({
  className = "",
  wrapperClassName = "",
  children,
  ...props
}: ComponentProps<"select"> & { wrapperClassName?: string }) {
  return (
    <div className={`relative ${wrapperClassName}`}>
      <select
        className={`h-9 w-full cursor-pointer appearance-none rounded-lg border border-[#2e2e2e] bg-[#242424] pl-3 pr-9 text-[13px] text-[#e5e5e5] outline-none transition-colors focus:border-[#22d3ee] disabled:opacity-40 ${FOCUS_RING} ${className}`}
        {...props}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#919191]">
        <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
    </div>
  );
}
