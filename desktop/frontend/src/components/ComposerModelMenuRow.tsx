import type { MouseEvent } from "react";

// One row of the composer's model menu or its level flyout. The `cursor` state
// is the menu's own highlight, driven by hover or the arrow keys, and is
// separate from `checked`, which marks what the terminal is running.
export function ComposerModelMenuRow({
  id,
  label,
  checked,
  cursor,
  dim,
  disabled,
  onMouseDown,
  onMouseEnter,
  onClick,
}: {
  id: string;
  label: string;
  checked: boolean;
  cursor: boolean;
  dim?: boolean;
  disabled?: boolean;
  onMouseDown: (e: MouseEvent) => void;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  return (
    <button
      id={id}
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={`mx-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-md px-2 py-[5px] text-left text-[12.5px] leading-4 transition-colors duration-75 ${
        cursor ? (dim ? "bg-[var(--bg-hover)]" : "bg-[var(--bg-active)]") : ""
      } ${
        disabled
          ? "cursor-default text-[var(--text-muted)] opacity-40"
          : checked
            ? "font-medium text-[var(--text-primary)]"
            : cursor
              ? "text-[var(--text-primary)]"
              : "text-[var(--text-secondary)]"
      }`}
    >
      {/* A radio mark, not a tick: the row is one choice among alternatives,
          which is also what its role says. Leading, so every row's label
          starts on the same line and the filled one is found by shape. */}
      <span
        aria-hidden
        className={`h-[7px] w-[7px] shrink-0 rounded-full border-[1.5px] ${
          checked
            ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]"
            : "border-[var(--text-muted)] opacity-60"
        }`}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}
