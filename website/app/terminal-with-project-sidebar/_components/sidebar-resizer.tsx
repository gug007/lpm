"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";

type Props = {
  width: number;
  min: number;
  max: number;
  onResize: (width: number) => void;
  /** Called when a drag ends or a key adjusts the width — not on every move. */
  onCommit: () => void;
};

const STEP = 8;
const BIG_STEP = 32;

export function SidebarResizer({ width, min, max, onResize, onCommit }: Props) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const clamp = (value: number) => Math.min(max, Math.max(min, value));

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { x: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    onResize(clamp(drag.current.width + (event.clientX - drag.current.x)));
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    onCommit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? BIG_STEP : STEP;
    const next =
      event.key === "ArrowLeft"
        ? width - step
        : event.key === "ArrowRight"
          ? width + step
          : event.key === "Home"
            ? min
            : event.key === "End"
              ? max
              : null;
    if (next === null) return;
    event.preventDefault();
    onResize(clamp(next));
    onCommit();
  };

  // The divider stays a hairline; the `after` overlay widens what the pointer
  // can actually grab to 20 px without taking any layout width.
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Project sidebar width"
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={`${width} pixels`}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      className="group relative hidden w-2 shrink-0 cursor-col-resize touch-none items-stretch justify-center bg-[#1e1e1e] after:absolute after:inset-y-0 after:-right-1.5 after:-left-1.5 after:content-[''] focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-inset focus-visible:outline-none md:flex"
    >
      <span
        aria-hidden
        className="w-px bg-[#2e2e2e] transition-colors group-hover:bg-[#5a5a5a] group-focus-visible:bg-indigo-400"
      />
    </div>
  );
}
