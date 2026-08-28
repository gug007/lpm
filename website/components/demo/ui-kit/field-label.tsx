"use client";

import type { ComponentProps } from "react";

export function FieldLabel({ className = "", ...props }: ComponentProps<"label">) {
  return (
    <label
      className={`mb-1.5 block text-xs font-medium text-[#b3b3b3] ${className}`}
      {...props}
    />
  );
}
