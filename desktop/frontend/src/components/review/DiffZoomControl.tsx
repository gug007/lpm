import { Tooltip } from "../ui/Tooltip";

interface DiffZoomControlProps {
  fontSize: number;
  baseFontSize: number;
  min: number;
  max: number;
  onZoom: (delta: number) => void;
  onReset: () => void;
}

const btn =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm leading-none text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--text-muted)]";

export function DiffZoomControl({
  fontSize,
  baseFontSize,
  min,
  max,
  onZoom,
  onReset,
}: DiffZoomControlProps) {
  const pct = Math.round((fontSize / baseFontSize) * 100);
  return (
    <div className="flex shrink-0 items-center rounded-lg bg-[var(--bg-secondary)]/70 p-0.5">
      <Tooltip content="Zoom out" side="bottom">
        <button
          onClick={() => onZoom(-1)}
          disabled={fontSize <= min}
          aria-label="Zoom out"
          className={btn}
        >
          &#8722;
        </button>
      </Tooltip>
      <Tooltip content="Reset zoom" side="bottom">
        <button
          onClick={onReset}
          aria-label="Reset zoom"
          className="h-6 min-w-[2.75rem] rounded-md px-1 text-[10px] font-medium tabular-nums text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          {pct}%
        </button>
      </Tooltip>
      <Tooltip content="Zoom in" side="bottom">
        <button
          onClick={() => onZoom(1)}
          disabled={fontSize >= max}
          aria-label="Zoom in"
          className={btn}
        >
          +
        </button>
      </Tooltip>
    </div>
  );
}
