"use client";

import type { ComponentProps } from "react";
import { FOCUS_RING, PRESS } from "../ui";

export function DangerButton({
  className = "",
  type = "button",
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={`rounded-lg bg-[#f87171] px-4 py-2 text-sm font-medium text-white hover:opacity-85 disabled:opacity-40 ${FOCUS_RING} ${PRESS} ${className}`}
      {...props}
    />
  );
}
