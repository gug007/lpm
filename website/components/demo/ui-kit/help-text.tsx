"use client";

import type { ComponentProps } from "react";

export function HelpText({ className = "", ...props }: ComponentProps<"p">) {
  return (
    <p
      className={`mt-1 text-[11px] leading-relaxed text-[#919191] ${className}`}
      {...props}
    />
  );
}
