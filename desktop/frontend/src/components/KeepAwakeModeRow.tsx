import type { ReactNode } from "react";

// One choice in the Keep awake menu: a radio row, with what it means or the
// controls that tune it underneath. Without `onSelect` the row only heads its
// controls, which start it themselves.
export function KeepAwakeModeRow({
  checked,
  label,
  detail,
  onSelect,
  children,
}: {
  checked: boolean;
  label: string;
  detail?: string;
  onSelect?: () => void;
  children?: ReactNode;
}) {
  const radio = (
    <span
      aria-hidden
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
        checked ? "border-[var(--accent-amber)]" : "border-[var(--text-muted)]"
      }`}
    >
      {checked && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-amber)]" />}
    </span>
  );
  const title = "flex w-full items-center gap-2 text-left text-[12px] font-medium text-[var(--text-primary)]";
  return (
    <div
      className={`mx-1 rounded-md px-2 py-1.5 transition-colors ${
        checked ? "bg-[var(--bg-active)]" : onSelect ? "hover:bg-[var(--bg-hover)]" : ""
      }`}
    >
      {onSelect ? (
        <button
          type="button"
          role="menuitemradio"
          aria-checked={checked}
          onClick={onSelect}
          className={`${title} rounded outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-cyan)]/60`}
        >
          {radio}
          {label}
        </button>
      ) : (
        <div className={title}>
          {radio}
          {label}
        </div>
      )}
      {(children || detail) && (
        // As tall as a row of chips, so a row keeps its height when its chips come and go.
        <div className="mt-1 flex min-h-[21px] items-center pl-[22px] text-[11px] leading-snug text-[var(--text-muted)]">
          {children || detail}
        </div>
      )}
    </div>
  );
}
