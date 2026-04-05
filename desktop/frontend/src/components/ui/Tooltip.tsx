import type { ReactNode } from "react";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
}

export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  const placement = side === "top"
    ? "bottom-full mb-1"
    : "top-full mt-1";
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 font-mono text-[10px] font-medium text-[var(--text-primary)] opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100 ${placement}`}
      >
        {content}
      </span>
    </span>
  );
}
