import { ChevronDown, Folder, Laptop, PanelLeftClose } from "lucide-react";

type State = "running" | "stopped" | "error";

const DOTS: Record<State, string> = {
  running: "bg-[#4ade80]",
  stopped: "border border-[#8f8f8f]",
  error: "bg-[#ef4444]",
};

type Row = {
  name: string;
  state: State;
  indent?: boolean;
  tone?: "muted" | "amber" | "shimmer";
};

const ROWS: Row[] = [
  { name: "checkout", state: "running", indent: true },
  { name: "checkout-refunds", state: "running", indent: true, tone: "muted" },
  { name: "billing", state: "stopped", indent: true, tone: "shimmer" },
  { name: "auth-hotfix", state: "running", tone: "amber" },
  { name: "marketing-site", state: "error", tone: "muted" },
  { name: "infra", state: "stopped" },
];

const TONES = {
  muted: "text-[#8f8f8f]",
  amber: "text-[#f59e0b]",
  shimmer: "sidebar-shimmer",
};

export function SidebarAnatomy() {
  return (
    <div>
      <div
        aria-hidden
        className="w-full max-w-[280px] overflow-hidden rounded-xl border border-[#2e2e2e] bg-[#1e1e1e] py-2 shadow-xl shadow-gray-200/50 select-none dark:shadow-black/40"
      >
        <div className="flex items-center justify-between gap-2 px-3 pt-1 pb-2">
          <span className="text-[10px] font-medium tracking-wider text-[#919191] uppercase">
            Projects
          </span>
          <PanelLeftClose className="h-3.5 w-3.5 text-[#919191]" />
        </div>

        <div className="px-1.5">
          <div className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-[#b3b3b3]">
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#8f8f8f]" />
            <Folder className="h-3.5 w-3.5 shrink-0 text-[#8f8f8f]" />
            <span className="min-w-0 truncate">Client work</span>
          </div>

          {ROWS.map((row) => (
            <div
              key={row.name}
              className={`flex items-center gap-2 rounded-md py-1.5 pr-2 text-[13px] text-[#b3b3b3] ${
                row.indent ? "pl-5" : "pl-2"
              }`}
            >
              <span
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOTS[row.state]}`}
              />
              <span
                className={`min-w-0 flex-1 truncate ${row.tone ? TONES[row.tone] : ""}`}
              >
                {row.name}
              </span>
              {row.state === "error" && (
                <span className="shrink-0 text-[9px] tracking-wide text-[#f87171] uppercase">
                  config error
                </span>
              )}
              {row.tone === "amber" && (
                <span className="shrink-0 text-[9px] tracking-wide text-[#f59e0b] uppercase">
                  needs you
                </span>
              )}
            </div>
          ))}

          <div className="mt-2 flex items-center gap-1.5 border-t border-[#2e2e2e] px-2 pt-2.5 pb-1 text-[11px] tracking-wide text-[#9e9e9e] uppercase">
            <Laptop className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">Studio Mac</span>
          </div>
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-[#b3b3b3]">
            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4ade80]" />
            <span className="min-w-0 flex-1 truncate">design-system</span>
          </div>
        </div>
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
        <li className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full bg-emerald-600 dark:bg-[#4ade80]"
          />
          Filled dot — running
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full border border-gray-500 dark:border-gray-400"
          />
          Hollow dot — stopped
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full bg-red-600 dark:bg-[#ef4444]"
          />
          Red dot, labelled in the row — config error
        </li>
      </ul>
    </div>
  );
}
