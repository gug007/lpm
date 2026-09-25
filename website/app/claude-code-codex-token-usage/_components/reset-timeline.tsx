"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Clock3, Gauge, Sun, type LucideIcon } from "lucide-react";
import {
  GAP_SHARE,
  LAST_USED_X,
  NEAR_END,
  NIGHT,
  NOW_LABEL,
  TICKS,
  type Flag,
  type FlagIcon,
} from "./reset-data";

const ICONS: Record<FlagIcon, LucideIcon> = { gauge: Gauge, clock: Clock3, sun: Sun };

const ROW = 24;
const FLAG_GAP = 6;
const TRACK = "absolute top-1/2 h-1 -translate-y-1/2 rounded-full";

const pct = (x: number) => `${x * 100}%`;

// Ported from the app's SendLaterTimeline so labels and rows land where it puts them.
const flagWidth = (label: string) => label.length * 6 + 28;

const flagLeft = (x: number, width: number) =>
  `clamp(0px, calc(${pct(x)} - ${width / 2}px), calc(100% - ${width}px))`;

function placeFlags(flags: Flag[], width: number | null): { flag: Flag; row: 0 | 1 }[] {
  if (width === null) return flags.map((flag) => ({ flag, row: flag.row }));
  const ends = [-Infinity, -Infinity];
  return [...flags]
    .sort((a, b) => a.x - b.x)
    .flatMap((flag) => {
      const w = flagWidth(flag.label);
      const left = Math.min(Math.max(0, flag.x * width - w / 2), Math.max(0, width - w));
      const row = ends.findIndex((end) => left >= end + FLAG_GAP);
      if (row === -1) return [];
      ends[row] = left + w;
      return [{ flag, row: row as 0 | 1 }];
    });
}

type Props = {
  flags: Flag[];
  dotX: number;
  onFlag: (flag: Flag) => void;
};

export default function ResetTimeline({ flags, dotX, onFlag }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const placed = placeFlags(flags, width);
  const height = (placed.some((p) => p.row === 1) ? 2 : 1) * ROW;
  const tip = placed.find((p) => p.flag.key === "limit")?.flag;

  return (
    <div className="@container select-none px-1">
      {tip?.title && (
        <div aria-hidden className="relative h-7">
          <p
            className="absolute top-0 whitespace-nowrap rounded-md bg-[var(--bg-active)] px-2 py-1 text-[10.5px] leading-none text-[var(--text-primary)]"
            style={{ left: flagLeft(tip.x, flagWidth(tip.label)) }}
          >
            {tip.title}
          </p>
          <span
            className="absolute top-[15px] h-2 w-2 -translate-x-1/2 rotate-45 bg-[var(--bg-active)]"
            style={{ left: pct(tip.x) }}
          />
        </div>
      )}

      <div ref={boxRef} className="relative" style={{ height }}>
        {placed.map(({ flag, row }) => {
          const Icon = ICONS[flag.icon];
          const flagW = flagWidth(flag.label);
          return (
            <div key={flag.key}>
              <span
                aria-hidden
                className="absolute w-px bg-[var(--border)]"
                style={{ left: pct(flag.x), top: row * ROW + 20, height: height - row * ROW + 1 }}
              />
              <button
                type="button"
                title={flag.title}
                data-flag
                onClick={() => onFlag(flag)}
                style={{ left: flagLeft(flag.x, flagW), top: row * ROW, width: flagW }}
                className="absolute flex h-5 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-1.5 text-[10.5px] text-[var(--text-secondary)] transition-colors after:absolute after:inset-x-0 after:-inset-y-0.5 hover:border-[var(--accent-blue)] hover:text-[var(--text-primary)] focus-visible:border-[var(--accent-blue)] focus-visible:text-[var(--text-primary)] [&>svg]:shrink-0"
              >
                <Icon aria-hidden size={11} strokeWidth={1.75} />
                {flag.label}
              </button>
            </div>
          );
        })}
      </div>

      <div aria-hidden className="relative mt-2.5 h-[22px]">
        <span className={`${TRACK} bg-[var(--border)]`} style={{ left: 0, width: pct(NEAR_END) }} />
        <span className={`${TRACK} bg-[var(--border)]`} style={{ left: pct(NEAR_END + GAP_SHARE), right: 0 }} />
        <span
          className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm opacity-70 [background:repeating-linear-gradient(-55deg,var(--border)_0_1.5px,transparent_1.5px_4px)]"
          style={{ left: pct(NIGHT.x0), width: pct(NIGHT.x1 - NIGHT.x0) }}
        />
        <span className={`${TRACK} bg-[var(--accent-blue)]`} style={{ left: 0, width: pct(Math.min(dotX, NEAR_END)) }} />
        <span className="absolute left-0 top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-[var(--text-secondary)]" />
        <span
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--accent-blue)] bg-[var(--bg-primary)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent-blue)_18%,transparent)]"
          style={{ left: pct(dotX) }}
        />
      </div>

      <div aria-hidden className="relative h-4">
        {TICKS.map((tick) => (
          <span
            key={tick.x}
            className={`absolute top-0 w-px -translate-x-1/2 bg-[var(--text-muted)] ${tick.major ? "h-1.5 opacity-60" : "h-1 opacity-35"}`}
            style={{ left: pct(tick.x) }}
          />
        ))}
      </div>
      <div aria-hidden className="relative h-4 text-[10px] tabular-nums text-[var(--text-muted)]">
        <span className="absolute left-0 top-0 font-medium text-[var(--text-secondary)]">Now</span>
        {TICKS.filter((tick) => tick.label).map((tick) => (
          <span
            key={tick.x}
            className={`absolute top-0 -translate-x-1/2 whitespace-nowrap ${tick.wide ? "@max-[348px]:hidden" : ""}`}
            style={{ left: pct(tick.x) }}
          >
            {tick.label}
          </span>
        ))}
      </div>
      <div aria-hidden className="relative h-3.5 text-[10px] text-[var(--text-muted)]">
        <span className="absolute left-0 top-0 tabular-nums">{NOW_LABEL}</span>
        <span
          className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[var(--accent-blue)] @max-[348px]:hidden"
          style={{ left: pct(LAST_USED_X) }}
        >
          last used
        </span>
      </div>
    </div>
  );
}
