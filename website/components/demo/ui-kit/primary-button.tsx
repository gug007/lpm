"use client";

import type { ComponentProps } from "react";
import { FOCUS_RING, PRESS } from "../ui";

export function PrimaryButton({
  className = "",
  type = "button",
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={`rounded-lg bg-[#e5e5e5] px-4 py-2 text-sm font-medium text-[#1a1a1a] hover:opacity-90 disabled:opacity-40 ${FOCUS_RING} ${PRESS} ${className}`}
      {...props}
    />
  );
}
