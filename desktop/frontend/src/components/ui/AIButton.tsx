import { type ReactNode } from "react";
import { SparkleIcon } from "../icons";

interface AIButtonProps {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  title?: string;
  trailing?: ReactNode;
  children: ReactNode;
}

const GRADIENT = "rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 p-[1px] shadow-sm transition-all hover:shadow-md hover:shadow-purple-500/20";
const INNER = "inline-flex items-center gap-1.5 bg-[var(--bg-primary)] px-3 py-1 text-[var(--text-primary)] transition-colors";
const HOVER = "group-hover:bg-transparent group-hover:text-white";

export function AIButton({ onClick, disabled, loading, title, trailing, children }: AIButtonProps) {
  return (
    <div className={`group relative inline-flex ${GRADIENT} active:scale-[0.98] ${disabled ? "opacity-40 hover:shadow-sm" : ""}`}>
      <button
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={`${INNER} ${trailing ? "rounded-l-full pl-3 pr-2" : "rounded-full"} text-xs font-medium ${HOVER} disabled:pointer-events-none`}
      >
        <span className={loading ? "animate-spin" : ""}><SparkleIcon /></span>
        {children}
      </button>
      {trailing && (
        <div className={`${INNER} rounded-r-full border-l border-white/20 px-1.5 text-[var(--text-muted)] ${HOVER}`}>
          {trailing}
        </div>
      )}
    </div>
  );
}
