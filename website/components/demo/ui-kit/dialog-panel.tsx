"use client";

import type { ComponentProps } from "react";
import { DIALOG_PANEL_CLASS } from "./styles";

export function DialogPanel({
  className = "",
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      {...props}
      role="dialog"
      aria-modal="true"
      className={`w-[460px] ${DIALOG_PANEL_CLASS} ${className}`}
    >
      {children}
    </div>
  );
}
