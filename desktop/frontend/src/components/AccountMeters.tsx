import type { UsageMeter } from "../sidebarUsage";
import { PaceTick } from "./PaceTick";

/** An account's 5-hour and weekly bars, drawn the way the sidebar draws them. */
export function AccountMeters({ meters, className = "" }: { meters: UsageMeter[]; className?: string }) {
  return (
    <>
      {meters.map((meter) => (
        <span
          key={meter.label}
          className={`flex w-full items-center gap-1.5 text-[10px] text-[var(--text-muted)] ${className}`}
        >
          <span className="w-3.5 shrink-0">{meter.label}</span>
          <span className="relative h-[3px] flex-1 rounded-full bg-[var(--bg-active)]">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${meter.fraction > 0 ? Math.max(2, Math.round(meter.fraction * 100)) : 0}%`,
                backgroundColor: meter.fill,
              }}
            />
            {meter.pace !== null && <PaceTick at={meter.pace} />}
          </span>
          <span
            className={`w-7 shrink-0 text-right tabular-nums ${
              meter.percent >= 95 ? "text-[var(--accent-red)]" : "text-[var(--text-secondary)]"
            }`}
          >
            {meter.percentText}
          </span>
          <span className="w-10 shrink-0 text-right tabular-nums">{meter.detail}</span>
        </span>
      ))}
    </>
  );
}
