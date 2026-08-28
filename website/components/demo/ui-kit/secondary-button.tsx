"use client";

import type { ComponentProps } from "react";
import { FOCUS_RING, PRESS } from "../ui";

export function SecondaryButton({
  className = "",
  type = "button",
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={`rounded-lg border border-[#2e2e2e] px-4 py-2 text-sm font-medium text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5] disabled:opacity-40 ${FOCUS_RING} ${PRESS} ${className}`}
      {...props}
    />
  );
}
