"use client";

import { sidebarUsageRows, type UsageSidebarSettings } from "./usage-data";

// Live plan usage in the sidebar footer: one line per agent CLI with when its
// window comes back, over a bar of how much of it is gone.
export function SidebarUsage({
  settings,
  onOpen,
}: {
  settings: UsageSidebarSettings;
  onOpen: () => void;
}) {
  const rows = sidebarUsageRows(settings);
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5 px-2 pb-0.5 pt-1">
      {rows.map((row) => (
        <button
          key={row.key}
          type="button"
          onClick={onOpen}
          title={`${row.label} — ${row.percentText} of the ${row.windowLabel} window used, resets in ${row.detail}`}
          aria-label={`${row.label}, ${row.percentText} of the ${row.windowLabel} window used, resets in ${row.detail}`}
          className="flex w-full flex-col gap-1 rounded-md px-3 py-1 text-left transition-colors hover:bg-[#2a2a2a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
        >
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: row.color }}
            />
            <span className="w-[42px] shrink-0 text-[11px] text-[#b3b3b3]">{row.label}</span>
            <span className="ml-auto min-w-0 truncate text-[10px] tabular-nums text-[#919191]">
              {row.detail}
            </span>
            <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-[#b3b3b3]">
              {row.percentText}
            </span>
          </span>
          <span className="block h-[3px] w-full overflow-hidden rounded-full bg-[#333333]">
            <span
              className="block h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.max(2, Math.round(row.fraction * 100))}%`,
                backgroundColor: row.fill,
              }}
            />
          </span>
        </button>
      ))}
    </div>
  );
}
