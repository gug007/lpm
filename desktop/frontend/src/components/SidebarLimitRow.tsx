import { useState } from "react";
import type { LimitWindow, ProviderLimits } from "../hooks/useAgentLimits";
import {
  STALE_MS,
  asOfText,
  barColor,
  fmtPct,
  providerMeta,
  resetText,
} from "./stats/limitsFormat";

function Bar({ pct, stale }: { pct: number; stale: boolean }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-active)]">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          width: `${clamped}%`,
          backgroundColor: barColor(pct),
          opacity: stale ? 0.4 : 1,
        }}
      />
    </div>
  );
}

function PopoverWindow({
  title,
  win,
  now,
}: {
  title: string;
  win: LimitWindow | undefined;
  now: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-[var(--text-secondary)]">{title}</span>
        <span className="text-[11px] font-medium tabular-nums text-[var(--text-primary)]">
          {win ? fmtPct(win.usedPercent) : "—"}
        </span>
      </div>
      {win && <Bar pct={win.usedPercent} stale={false} />}
      {win && win.resetsAt > 0 && (
        <span className="text-[10px] text-[var(--text-muted)]">
          {resetText(win.resetsAt, now)}
        </span>
      )}
    </div>
  );
}

export function SidebarLimitRow({
  data,
  now,
  onClick,
}: {
  data: ProviderLimits;
  now: number;
  onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const meta = providerMeta(data.provider);
  const stale = now - data.updatedAt > STALE_MS;
  const primary = data.fiveHour ?? data.weekly;

  return (
    <div
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        role={onClick ? "button" : undefined}
        onClick={onClick}
        className={`flex items-center gap-2 rounded-md px-3 py-1.5 hover:bg-[var(--bg-hover)] ${
          onClick ? "cursor-pointer" : ""
        }`}
      >
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: meta.dot, opacity: stale ? 0.5 : 1 }}
        />
        <span className="w-[42px] shrink-0 text-[11px] text-[var(--text-secondary)]">
          {meta.label}
        </span>
        <div className="min-w-0 flex-1">
          <Bar pct={primary?.usedPercent ?? 0} stale={stale} />
        </div>
        <span
          className={`w-8 shrink-0 text-right text-[11px] tabular-nums ${
            stale ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]"
          }`}
        >
          {primary ? fmtPct(primary.usedPercent) : "—"}
        </span>
      </div>

      {hover && (
        <div className="absolute bottom-full left-2 right-2 z-50 mb-1 flex flex-col gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-primary)]">
              {meta.label} usage
            </span>
            {data.label && (
              <span className="rounded bg-[var(--bg-active)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
                {data.label}
              </span>
            )}
          </div>
          <PopoverWindow title="5-hour window" win={data.fiveHour} now={now} />
          <PopoverWindow title="Weekly window" win={data.weekly} now={now} />
          {stale && (
            <span className="text-[10px] text-[var(--text-muted)]">
              {asOfText(data.updatedAt, now)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
