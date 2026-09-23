import { AlertCircle, Bell, Check } from "lucide-react";
import { SIDEBAR_ROWS, STATE_TONE, type AgentState } from "./visual-data";

const STATE_MARK: Record<AgentState, typeof Bell | null> = {
  working: null,
  "needs-you": Bell,
  done: Check,
  error: AlertCircle,
};

export default function VisualSidebar() {
  return (
    <div className="flex w-[8.75rem] shrink-0 flex-col gap-px overflow-hidden border-r border-[#262626] bg-[#161616] px-1 py-2 sm:w-[13.5rem] sm:px-1.5">
      <span className="px-2 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-gray-500">
        Projects
      </span>
      {SIDEBAR_ROWS.map((row) => (
        <div key={row.name} className="flex flex-col">
          <div
            className={`flex items-center gap-2 rounded-md px-2 py-[5px] text-[9px] sm:text-[11px] ${
              row.selected ? "bg-white/[0.08] text-gray-100" : "text-gray-400"
            }`}
          >
            <span className="relative inline-flex h-[6px] w-[6px] shrink-0 sm:h-[7px] sm:w-[7px]">
              {row.kind === "copy" && (
                <span
                  className={`absolute -left-[3px] -top-[3px] h-[6px] w-[6px] rounded-full opacity-35 ${
                    row.running ? "bg-emerald-400" : "bg-gray-500"
                  }`}
                />
              )}
              {row.kind === "worktree" && (
                <>
                  <span className="absolute -left-[4px] top-1/2 h-px w-[4px] bg-gray-600" />
                  <span className="absolute -left-[6px] top-1/2 h-[3px] w-[3px] -translate-y-1/2 rounded-full bg-gray-600" />
                </>
              )}
              <span
                className={`relative h-full w-full rounded-full ${
                  row.running
                    ? "bg-emerald-400 shadow-[0_0_5px_rgba(16,185,129,0.7)]"
                    : "border border-[#555] bg-[#161616]"
                }`}
              />
            </span>
            <span className="min-w-0 flex-1 truncate">{row.name}</span>
          </div>
          {row.rollup && (
            <div className="-mt-1 truncate pb-1 pl-[1.6rem] text-[9px] sm:text-[10px]">
              {row.rollup.map((segment, i) => (
                <span key={segment.text}>
                  {i > 0 && <span className="px-1 text-gray-600">·</span>}
                  <span className={segment.className}>{segment.text}</span>
                </span>
              ))}
            </div>
          )}
          {row.agents?.map((agent) => {
            const Mark = STATE_MARK[agent.state];
            return (
              <div
                key={agent.title}
                className="flex items-center gap-1.5 rounded-md py-[3px] pl-[1.6rem] pr-1.5 text-[9px] text-gray-400 sm:gap-2 sm:text-[10.5px]"
              >
                <span className={`min-w-0 flex-1 truncate ${STATE_TONE[agent.state]}`}>
                  {agent.title}
                </span>
                {Mark && (
                  <Mark
                    className={`h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3 ${STATE_TONE[agent.state]}`}
                    strokeWidth={2.25}
                  />
                )}
                <span className="shrink-0 tabular-nums text-gray-500">
                  {agent.elapsed}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
