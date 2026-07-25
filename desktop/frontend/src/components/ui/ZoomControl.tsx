import { Tooltip } from "./Tooltip";

interface ZoomControlProps {
  // What the middle button reads, e.g. 120 for 120%. Surfaces zoom by font size
  // (the diff panes) or by a zoom factor (memory, the file viewer), so the
  // control takes the resolved percentage rather than either raw unit.
  percent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
}

const btn =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm leading-none text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--text-muted)]";

export function ZoomControl({
  percent,
  onZoomIn,
  onZoomOut,
  onReset,
  canZoomIn,
  canZoomOut,
}: ZoomControlProps) {
  return (
    <div className="flex shrink-0 items-center rounded-lg bg-[var(--bg-secondary)]/70 p-0.5">
      <Tooltip content="Zoom out" side="bottom">
        <button onClick={onZoomOut} disabled={!canZoomOut} aria-label="Zoom out" className={btn}>
          &#8722;
        </button>
      </Tooltip>
      <Tooltip content="Reset zoom" side="bottom">
        <button
          onClick={onReset}
          aria-label="Reset zoom"
          className="h-6 min-w-[2.75rem] rounded-md px-1 text-[10px] font-medium tabular-nums text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          {percent}%
        </button>
      </Tooltip>
      <Tooltip content="Zoom in" side="bottom">
        <button onClick={onZoomIn} disabled={!canZoomIn} aria-label="Zoom in" className={btn}>
          +
        </button>
      </Tooltip>
    </div>
  );
}
