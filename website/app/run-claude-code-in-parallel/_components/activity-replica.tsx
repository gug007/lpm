import { Layers, Terminal } from "lucide-react";
import { ACTIVITY_FILTERS, ACTIVITY_ROWS, ACTIVITY_STATE } from "./activity-data";

export default function ActivityReplica() {
  return (
    <div
      data-on-dark
      aria-hidden="true"
      className="overflow-hidden rounded-xl bg-[#111113] p-1.5 shadow-2xl shadow-gray-300/60 ring-1 ring-black/15 dark:shadow-black/60 dark:ring-[#3a3a3c]"
    >
      <div className="overflow-hidden rounded-lg bg-[#1a1a1a] px-4 pb-3 pt-4">
        <div className="flex items-center gap-2 text-[15px] font-semibold text-gray-100">
          <Layers className="h-4 w-4 text-gray-500" strokeWidth={1.75} />
          Activity
        </div>
        <p className="mt-0.5 truncate text-[11px] text-gray-500">
          Your agents and automations, with anything waiting on you shown
          first.
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5 border-b border-[#2e2e2e] pb-3">
          {ACTIVITY_FILTERS.map((filter) => (
            <span
              key={filter.label}
              className="flex items-center gap-1.5 rounded-full bg-[#242424] px-2 py-0.5 text-[10.5px] text-gray-400"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${filter.dot}`} />
              <span className="tabular-nums text-gray-300">{filter.count}</span>
              {filter.label}
            </span>
          ))}
        </div>

        <ul className="mt-2 space-y-0.5">
          {ACTIVITY_ROWS.map((row, i) => {
            const state = ACTIVITY_STATE[row.state];
            return (
              <li
                key={`${row.project}-${row.tab}`}
                className={`flex items-center gap-3 rounded-lg px-2 py-2 ${
                  i === 0 ? "bg-white/[0.05] ring-1 ring-inset ring-[#60a5fa]/60" : ""
                }`}
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#262626] ${
                    row.state === "working" ? "sidebar-shimmer-icon" : "text-gray-500"
                  }`}
                >
                  <Terminal className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-[12.5px] font-medium text-gray-100">
                      {row.project}
                    </span>
                    <span className="hidden min-w-0 truncate text-[11.5px] text-gray-500 sm:inline">
                      {row.tab}
                    </span>
                  </div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-gray-500">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${state.dot}`} />
                    <span className={`shrink-0 ${state.text}`}>{state.label}</span>
                    <span className="truncate">· {row.agent}</span>
                  </div>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-gray-500">
                  {row.elapsed}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
