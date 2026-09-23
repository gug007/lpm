import { meterFill, type LimitWindowSample } from "./plan-limits-data";

export function LimitMeter({ window: w }: { window: LimitWindowSample }) {
  const ahead = w.verdict === "ahead of pace";
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-[10px] font-medium uppercase tracking-[0.13em] text-white/45">
        {w.label}
      </span>
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span className="text-2xl font-semibold leading-none tabular-nums text-white">
          {w.used}
        </span>
        <span className="text-sm leading-none text-white/45">%</span>
        <span
          className={`text-[11px] leading-none ${ahead ? "text-amber-300" : "text-white/50"}`}
        >
          {w.verdict}
        </span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className={`h-full rounded-full ${meterFill(w.used)}`}
          style={{ width: `${w.used}%` }}
        />
        <div
          className="absolute inset-y-0 w-px -translate-x-1/2 bg-white/70"
          style={{ left: `${w.elapsed}%` }}
        />
      </div>
      <div className="flex min-h-[14px] flex-col gap-0.5 text-[11px] tabular-nums">
        <span className="truncate text-white/45">{w.resets}</span>
        {w.runsOut && <span className="leading-snug text-amber-300">{w.runsOut}</span>}
      </div>
    </div>
  );
}
