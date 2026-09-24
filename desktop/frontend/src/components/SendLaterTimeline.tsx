import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { GAP_SHARE, buildTicks, fromX, nightBands, snapTime, stepTime, toX, type TimelineScale } from "../sendLater/timeline";
import { HOUR, MINUTE, clockLabel, readbackLabel } from "../sendLater/time";

export interface TimelineFlag {
  key: string;
  t: number;
  label: string;
  icon: ReactNode;
  title?: string;
}

interface SendLaterTimelineProps {
  scale: TimelineScale;
  value: number;
  lastUsedAt: number | null;
  flags: TimelineFlag[];
  onChange: (at: number) => void;
  // A flag under the pointer or keyboard focus, shown in the readback before it
  // is picked; null once it's left.
  onPreview: (at: number | null) => void;
  onPickFlag: (flag: TimelineFlag) => void;
  onCommit: () => void;
}

const FLAG_ROW = 24;
const FLAG_GAP = 6;
const TRACK_ZONE = 22;
// From a flag's bottom edge down to the middle of the line under it.
const STEM_REACH = -20 + 10 + TRACK_ZONE / 2;

function flagWidth(label: string) {
  return label.length * 6 + 28;
}

// Stack flags that would overlap into a second row, so every one stays readable.
function layoutFlags(flags: TimelineFlag[], scale: TimelineScale, width: number) {
  const placed: { flag: TimelineFlag; x: number; left: number; w: number; row: number }[] = [];
  const rowEnds = [-Infinity, -Infinity];
  for (const flag of [...flags].sort((a, b) => a.t - b.t)) {
    const x = toX(scale, flag.t) * width;
    const w = flagWidth(flag.label);
    const left = Math.min(Math.max(0, x - w / 2), Math.max(0, width - w));
    const row = left >= rowEnds[0] + FLAG_GAP ? 0 : 1;
    rowEnds[row] = Math.max(rowEnds[row], left + w);
    placed.push({ flag, x, left, w, row });
  }
  return placed;
}

// The Send later line: now at the left edge, tomorrow morning at the right, the
// moments that matter flagged above it, and a handle to drag or step with the
// arrow keys.
export function SendLaterTimeline({
  scale,
  value,
  lastUsedAt,
  flags,
  onChange,
  onPreview,
  onPickFlag,
  onCommit,
}: SendLaterTimelineProps) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const dragging = useRef(false);

  useLayoutEffect(() => {
    const el = zoneRef.current;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ticks = useMemo(() => (width > 0 ? buildTicks(scale, width) : []), [scale, width]);
  const bands = useMemo(() => nightBands(scale), [scale]);
  const placed = useMemo(() => layoutFlags(flags, scale, width), [flags, scale, width]);
  const rows = placed.some((p) => p.row === 1) ? 2 : placed.length > 0 ? 1 : 0;
  const flagsHeight = rows * FLAG_ROW;
  const valueX = toX(scale, value);
  const nearEndX = toX(scale, scale.nearEnd);
  const lastUsedX = lastUsedAt !== null && lastUsedAt <= scale.end ? toX(scale, lastUsedAt) : null;

  const atPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = zoneRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return value;
    return snapTime(scale, fromX(scale, (e.clientX - rect.left) / rect.width));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onChange(atPointer(e));
    e.currentTarget.querySelector<HTMLElement>("[role=slider]")?.focus();
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) onChange(atPointer(e));
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, () => number> = {
      ArrowRight: () => stepTime(scale, value, 1),
      ArrowUp: () => stepTime(scale, value, 1),
      ArrowLeft: () => stepTime(scale, value, -1),
      ArrowDown: () => stepTime(scale, value, -1),
      PageUp: () => Math.min(snapTime(scale, value + HOUR), scale.end),
      PageDown: () => snapTime(scale, Math.max(value - HOUR, scale.start + 5 * MINUTE)),
      Home: () => snapTime(scale, scale.start),
      End: () => scale.end,
    };
    if (e.key === "Enter") {
      e.preventDefault();
      onCommit();
      return;
    }
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    onChange(move());
  };

  const pct = (x: number) => `${x * 100}%`;

  return (
    <div className="select-none px-1">
      <div className="relative" style={{ height: flagsHeight }}>
        {placed.map(({ flag, x, left, w, row }) => (
          <div key={flag.key}>
            <span
              aria-hidden
              className="absolute w-px bg-[var(--border)]"
              style={{ left: x, top: row * FLAG_ROW + 20, height: flagsHeight - row * FLAG_ROW + STEM_REACH }}
            />
            <button
              type="button"
              title={flag.title}
              onMouseEnter={() => onPreview(flag.t)}
              onMouseLeave={() => onPreview(null)}
              onFocus={() => onPreview(flag.t)}
              onBlur={() => onPreview(null)}
              onClick={() => onPickFlag(flag)}
              style={{ left, top: row * FLAG_ROW, width: w }}
              className="absolute flex h-5 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-1.5 text-[10.5px] text-[var(--text-secondary)] outline-none transition-colors hover:border-[var(--accent-blue)] hover:text-[var(--text-primary)] focus-visible:border-[var(--accent-blue)] focus-visible:text-[var(--text-primary)] [&>svg]:shrink-0"
            >
              {flag.icon}
              {flag.label}
            </button>
          </div>
        ))}
      </div>

      <div
        ref={zoneRef}
        className="relative mt-2.5 cursor-pointer touch-none"
        style={{ height: TRACK_ZONE }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span
          aria-hidden
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--border)]"
          style={{ left: 0, width: pct(nearEndX) }}
        />
        <span
          aria-hidden
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--border)]"
          style={{ left: pct(nearEndX + GAP_SHARE), right: 0 }}
        />
        {bands.map((b, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm opacity-70 [background:repeating-linear-gradient(-55deg,var(--border)_0_1.5px,transparent_1.5px_4px)]"
            style={{ left: pct(b.x0), width: pct(Math.max(0.006, b.x1 - b.x0)) }}
          />
        ))}
        <span
          aria-hidden
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--accent-blue)]"
          style={{ left: 0, width: pct(Math.min(valueX, nearEndX)) }}
        />
        {valueX > nearEndX + GAP_SHARE && (
          <span
            aria-hidden
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--accent-blue)]"
            style={{ left: pct(nearEndX + GAP_SHARE), width: pct(valueX - nearEndX - GAP_SHARE) }}
          />
        )}
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-[var(--text-secondary)]"
        />
        <div
          role="slider"
          tabIndex={0}
          aria-label="When to send"
          aria-valuemin={scale.start}
          aria-valuemax={scale.end}
          aria-valuenow={value}
          aria-valuetext={readbackLabel(value, scale.start)}
          onKeyDown={onKeyDown}
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-[var(--accent-blue)] bg-[var(--bg-primary)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent-blue)_18%,transparent)] outline-none focus-visible:shadow-[0_0_0_5px_color-mix(in_srgb,var(--accent-blue)_35%,transparent)] active:cursor-grabbing"
          style={{ left: pct(valueX) }}
        />
      </div>

      <div className="relative h-4">
        {ticks.map((tick) => (
          <span
            key={tick.t}
            aria-hidden
            className={`absolute top-0 w-px -translate-x-1/2 bg-[var(--text-muted)] ${tick.major ? "h-1.5 opacity-60" : "h-1 opacity-35"}`}
            style={{ left: pct(tick.x) }}
          />
        ))}
      </div>
      <div className="relative h-4 text-[10px] tabular-nums text-[var(--text-muted)]">
        <span className="absolute left-0 top-0 font-medium text-[var(--text-secondary)]">Now</span>
        {ticks
          .filter((t) => t.label)
          .map((tick) => (
            <span
              key={tick.t}
              className={`absolute top-0 -translate-x-1/2 whitespace-nowrap ${
                tick.x > 0.97 ? "-translate-x-full" : ""
              }`}
              style={{ left: pct(tick.x) }}
            >
              {tick.label}
            </span>
          ))}
      </div>
      <div className="relative h-3.5 text-[10px] text-[var(--text-muted)]">
        <span className="absolute left-0 top-0 tabular-nums">{clockLabel(scale.start)}</span>
        {lastUsedX !== null && lastUsedX > 0.12 && (
          <span
            className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[var(--accent-blue)]"
            style={{ left: pct(lastUsedX) }}
          >
            last used
          </span>
        )}
      </div>
    </div>
  );
}
