import { useCallback, useEffect, useRef, useState } from "react";

export const MIN_SPEED = 0.5;
export const MAX_SPEED = 3;
const STEP = 0.25;
/** Called out under the track; the rest of the scale is read off these. */
const LABELS = [0.5, 1, 2, 3];
/** Keyboard edits land in bursts, so they settle before the engine is asked. */
const KEY_COMMIT_DELAY = 400;

export function formatSpeed(speed: number): string {
  return `${speed}×`;
}

function snap(raw: number): number {
  const stepped = Math.round(raw / STEP) * STEP;
  return Number(Math.max(MIN_SPEED, Math.min(MAX_SPEED, stepped)).toFixed(2));
}

function percent(speed: number): number {
  return ((speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)) * 100;
}

/**
 * Reading speed on a track that snaps to quarter steps.
 *
 * Every committed value costs a re-synthesis, so `onChange` fires once the
 * gesture is over — on release for a drag, after a pause for the arrow keys —
 * while the knob and the readout follow the finger the whole way.
 */
export function TTSSpeedSlider({
  value,
  onChange,
  onDraft,
}: {
  value: number;
  onChange: (speed: number) => void;
  onDraft?: (speed: number) => void;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const keyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = draft ?? value;

  // Hold the dragged value until the saved one catches up, so the readout
  // never snaps back to the old speed while the write is in flight.
  useEffect(() => {
    if (draft !== null && value === draft) setDraft(null);
  }, [draft, value]);

  useEffect(() => () => {
    if (keyTimer.current) clearTimeout(keyTimer.current);
  }, []);

  const valueAt = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return value;
    const ratio = (clientX - rect.left) / rect.width;
    return snap(MIN_SPEED + ratio * (MAX_SPEED - MIN_SPEED));
  }, [value]);

  const drag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      knobRef.current?.focus();
      const next = valueAt(e.clientX);
      setDraft(next);
      onDraft?.(next);
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture?.(e.pointerId);

      const move = (ev: PointerEvent) => {
        const v = valueAt(ev.clientX);
        setDraft(v);
        onDraft?.(v);
      };
      const up = (ev: PointerEvent) => {
        target.releasePointerCapture?.(ev.pointerId);
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        target.removeEventListener("pointercancel", up);
        onChange(valueAt(ev.clientX));
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
      target.addEventListener("pointercancel", up);
    },
    [onChange, onDraft, valueAt],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const delta =
        e.key === "ArrowRight" || e.key === "ArrowUp" ? STEP
        : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -STEP
        : e.key === "PageUp" ? STEP * 2
        : e.key === "PageDown" ? -STEP * 2
        : 0;
      const next =
        e.key === "Home" ? MIN_SPEED
        : e.key === "End" ? MAX_SPEED
        : delta ? snap(shown + delta)
        : null;
      if (next === null) return;
      e.preventDefault();
      e.stopPropagation();
      setDraft(next);
      onDraft?.(next);
      if (keyTimer.current) clearTimeout(keyTimer.current);
      keyTimer.current = setTimeout(() => onChange(next), KEY_COMMIT_DELAY);
    },
    [onChange, onDraft, shown],
  );

  const pct = percent(shown);

  return (
    <div className="px-1.5 pb-1 pt-2">
      <div
        onPointerDown={drag}
        className="relative -my-2 cursor-pointer py-2 select-none touch-none"
      >
        <div ref={trackRef} className="relative h-1.5 rounded-full bg-[var(--border)]">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent-blue)]"
            style={{ width: `${pct}%` }}
          />
          {LABELS.slice(1, -1).map((v) => (
            <span
              key={v}
              className="absolute top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--bg-primary)] opacity-70"
              style={{ left: `${percent(v)}%` }}
            />
          ))}
          <div
            ref={knobRef}
            role="slider"
            tabIndex={0}
            aria-label="Reading speed"
            aria-valuemin={MIN_SPEED}
            aria-valuemax={MAX_SPEED}
            aria-valuenow={shown}
            aria-valuetext={formatSpeed(shown)}
            onKeyDown={onKeyDown}
            className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-[var(--accent-blue)] shadow ring-2 ring-[var(--bg-primary)] transition-transform focus:outline-none hover:scale-110 focus-visible:scale-110"
            style={{ left: `calc(${pct}% - 7px)` }}
          />
        </div>
      </div>
      <div className="relative mt-2.5 h-3">
        {LABELS.map((v) => (
          <button
            key={v}
            type="button"
            tabIndex={-1}
            onClick={() => onChange(v)}
            className="absolute -top-0.5 rounded px-0.5 py-0.5 text-[10px] tabular-nums text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            style={{ left: `${percent(v)}%`, transform: `translateX(-${percent(v)}%)` }}
          >
            {formatSpeed(v)}
          </button>
        ))}
      </div>
    </div>
  );
}
