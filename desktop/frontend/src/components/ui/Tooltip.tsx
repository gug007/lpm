import type { ReactNode } from "react";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
}

export function Tooltip({ content, children, side = "top", align = "center" }: TooltipProps) {
  const placement = side === "top" ? "bottom-full mb-1" : "top-full mt-1";
  const alignment =
    align === "start" ? "left-0" :
    align === "end" ? "right-0" :
    "left-1/2 -translate-x-1/2";
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 font-mono text-[10px] font-medium text-[var(--text-primary)] opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100 ${placement} ${alignment}`}
      >
        {content}
      </span>
    </span>
  );
}
