import { useState, type ReactNode } from "react";
import { SparkleIcon, StopIcon } from "../icons";

interface AIButtonProps {
  onClick: () => void;
  // When given, the button stays live while loading and offers to stop the run
  // on hover/focus instead of just reporting progress.
  onCancel?: () => void;
  disabled?: boolean;
  loading?: boolean;
  title?: string;
  trailing?: ReactNode;
  children: ReactNode;
}

const GRADIENT = "rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 p-[1px] shadow-sm transition-all hover:shadow-md hover:shadow-purple-500/20";
const INNER = "inline-flex items-center gap-1.5 bg-[var(--bg-primary)] py-1 text-[var(--text-primary)] transition-colors";
const HOVER = "group-hover:bg-transparent group-hover:text-white";
// Force the trailing slot (an interactive child like a button) to fill the
// full height and width of its container so the whole gradient region is
// clickable, not just the SVG icon.
const TRAILING_FILL =
  "[&>button]:flex [&>button]:h-full [&>button]:items-center [&>button]:justify-center [&>button]:px-2.5 [&>button]:self-stretch";

export function AIButton({
  onClick,
  onCancel,
  disabled,
  loading,
  title,
  trailing,
  children,
}: AIButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const cancelable = !!loading && !!onCancel;
  const showStop = cancelable && (hovered || focused);
  const inert = cancelable ? false : disabled;

  return (
    <div className={`group relative inline-flex ${GRADIENT} active:scale-[0.98] ${inert ? "hover:shadow-sm" : ""}`}>
      <button
        onClick={showStop ? onCancel : onClick}
        disabled={inert}
        title={showStop ? "Stop generating" : title}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={`${INNER} ${trailing ? "rounded-l-full pl-3 pr-2" : "rounded-full px-3"} text-xs font-medium ${HOVER} disabled:opacity-40 disabled:pointer-events-none`}
      >
        {showStop ? <StopIcon /> : <span className={loading ? "animate-spin" : ""}><SparkleIcon /></span>}
        {showStop ? "Stop" : children}
      </button>
      {trailing && (
        <div className={`${INNER} ${TRAILING_FILL} rounded-r-full border-l border-white/20 text-[var(--text-muted)] ${HOVER}`}>
          {trailing}
        </div>
      )}
    </div>
  );
}
