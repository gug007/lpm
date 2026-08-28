"use client";

import type { ReactNode } from "react";

export function DialogOverlay({
  onClose,
  className = "",
  children,
}: {
  onClose?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm ${className}`}
      // Only a press that both starts and ends on the backdrop closes, so a
      // drag that ends outside a text selection doesn't dismiss the dialog.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      {children}
    </div>
  );
}
