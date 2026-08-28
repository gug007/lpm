"use client";

import type { ComponentProps } from "react";
import { FOCUS_RING, PRESS } from "../ui";

export function GhostButton({
  className = "",
  type = "button",
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={`rounded-md px-2 py-1.5 text-[12px] font-medium text-[#919191] hover:bg-[#2a2a2a] hover:text-[#e5e5e5] disabled:opacity-40 ${FOCUS_RING} ${PRESS} ${className}`}
      {...props}
    />
  );
}
