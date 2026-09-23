import { meterFill, SIDEBAR_ROWS } from "./plan-limits-data";

export function SidebarMeter() {
  return (
    <div className="rounded-xl border border-white/10 bg-[#141414] p-3">
      <p className="mb-2.5 text-[10px] font-medium uppercase tracking-[0.13em] text-white/45">
        Sidebar · weekly window
      </p>
      <ul className="space-y-2.5">
        {SIDEBAR_ROWS.map((row) => (
          <li key={row.name} className="space-y-1.5">
            <span className="flex items-center gap-2 text-[11px]">
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: row.dot }}
              />
              <span className="text-white/70">{row.name}</span>
              <span className="ml-auto text-[10px] tabular-nums text-white/45">
                {row.resets}
              </span>
              <span className="w-8 text-right tabular-nums text-white/70">
                {row.used}%
              </span>
            </span>
            <span className="relative block">
              <span className="block h-[3px] w-full overflow-hidden rounded-full bg-white/[0.08]">
                <span
                  className={`block h-full rounded-full ${meterFill(row.used)}`}
                  style={{ width: `${row.used}%` }}
                />
              </span>
              <span
                className="absolute -top-[3px] h-[9px] w-0.5 -translate-x-1/2 rounded-full bg-white"
                style={{ left: `${row.elapsed}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
