import type { ReactNode } from "react";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
}

const CENTER_X = "left-1/2 -translate-x-1/2";

export function Tooltip({ content, children, side = "top", align = "center" }: TooltipProps) {
  const placement = side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5";
  const alignment = align === "start" ? "left-0" : align === "end" ? "right-0" : CENTER_X;
  const arrowSide = side === "top"
    ? "bottom-0 translate-y-1/2 border-b border-r"
    : "top-0 -translate-y-1/2 border-l border-t";
  const arrowAlign = align === "start" ? "left-3" : align === "end" ? "right-3" : CENTER_X;
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 font-mono text-[10px] font-medium text-[var(--text-primary)] opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100 ${placement} ${alignment}`}
      >
        {content}
        <span
          aria-hidden
          className={`absolute h-2 w-2 rotate-45 border-[var(--border)] bg-[var(--bg-primary)] ${arrowSide} ${arrowAlign}`}
        />
      </span>
    </span>
  );
}
