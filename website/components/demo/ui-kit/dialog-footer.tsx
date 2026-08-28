"use client";

import type { ReactNode } from "react";

export function DialogFooter({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`mt-5 flex justify-end gap-2 ${className}`}>{children}</div>
  );
}
