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
  "flex h-7 w-6 shrink-0 items-center justify-center rounded-md text-sm leading-none text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--text-muted)]";

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
    <div className="flex shrink-0 items-center">
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
          className="h-7 min-w-[3.25rem] rounded-md px-1 text-[11px] tabular-nums text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
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
