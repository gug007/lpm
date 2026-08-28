"use client";

import type { ComponentProps } from "react";

export function ErrorText({ className = "", ...props }: ComponentProps<"p">) {
  return (
    <p className={`mt-1 text-[11px] text-[#f87171] ${className}`} {...props} />
  );
}
