import { AlertTriangle, Bell, Check, Loader } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Tab = {
  agent: string;
  task: string;
  state: string;
  icon: LucideIcon;
  tone: string;
};

const TABS: Tab[] = [
  {
    agent: "Claude",
    task: "refunds API",
    state: "Working 2m 30s",
    icon: Loader,
    tone: "sidebar-shimmer",
  },
  {
    agent: "Codex",
    task: "test suite",
    state: "Needs you",
    icon: Bell,
    tone: "sidebar-waiting",
  },
  {
    agent: "Claude",
    task: "docs pass",
    state: "Done · took 4m",
    icon: Check,
    tone: "text-[#60a5fa]",
  },
  {
    agent: "Codex",
    task: "migration",
    state: "Problem",
    icon: AlertTriangle,
    tone: "text-[#f87171]",
  },
];

export function AlertsReplica() {
  return (
    <div
      aria-hidden
      data-on-dark
      className="relative w-full overflow-hidden rounded-2xl border border-[#2e2e2e] bg-[#1b1b1b] p-4 sm:p-5 shadow-xl shadow-gray-200/60 dark:shadow-black/40 select-none"
    >
      <div className="absolute left-5 top-5 hidden gap-1.5 sm:flex">
        <span className="h-2.5 w-2.5 rounded-full bg-[#3a3a3a]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#3a3a3a]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#3a3a3a]" />
      </div>
      <div className="ml-auto w-full max-w-[300px] rounded-xl border border-white/10 bg-[#2b2b2b]/95 p-3 shadow-lg shadow-black/40">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#111] text-[10px] font-bold text-white ring-1 ring-white/10">
            lpm
          </span>
          <div className="min-w-0 text-[12px] leading-snug">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-white">Agent needs you</span>
              <span className="text-[11px] text-[#9a9a9a]">now</span>
            </div>
            <p className="mt-0.5 text-[#c8c8c8]">
              &ldquo;Codex&rdquo; in checkout is waiting for your approval.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {TABS.map(({ agent, task, state, icon: Icon, tone }) => (
          <div
            key={`${agent}-${task}`}
            className="min-w-0 rounded-lg border border-[#2e2e2e] bg-[#232323] px-3 py-2.5"
          >
            <div className="flex items-center gap-1.5 text-[12px] font-medium">
              <Icon
                className={`h-3.5 w-3.5 shrink-0 ${
                  tone === "sidebar-shimmer" ? "sidebar-shimmer-icon" : tone
                }`}
              />
              <span className={`shrink-0 ${tone}`}>{agent}</span>
              <span className="truncate text-[#8f8f8f]">· {task}</span>
            </div>
            <div className="mt-1 truncate text-[11px] text-[#a3a3a3] tabular-nums">
              {state}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
