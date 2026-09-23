import { ArrowUp, ChevronUp, Copy, Forward, SquarePen } from "lucide-react";

const MENU_ITEMS = [
  {
    icon: SquarePen,
    label: "Save as draft",
    description: "Keep this prompt to send later",
    shortcut: "⌘↵",
  },
  {
    icon: Forward,
    label: "Send to another tab",
    description: "Pick a tab in this or another open project",
  },
];

export default function VisualComposer() {
  return (
    <div className="relative shrink-0 border-t border-[#2d2d2d] bg-[#1a1a1a] p-2">
      <div className="absolute bottom-[calc(100%-0.25rem)] right-2 z-20 w-[min(12.25rem,calc(100%-1rem))] rounded-lg border border-[#333] bg-[#232323] py-1 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.9)] sm:w-[16.5rem]">
        {MENU_ITEMS.map(({ icon: Icon, label, description, shortcut }) => (
          <div
            key={label}
            className="flex items-start gap-2 px-2.5 py-1.5 text-[9px] text-gray-400 sm:text-[10.5px]"
          >
            <Icon className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-gray-300">{label}</span>
              <span className="hidden truncate text-[9px] text-gray-500 sm:block">
                {description}
              </span>
            </span>
            {shortcut && (
              <span className="hidden shrink-0 text-[9px] text-gray-500 min-[360px]:inline">
                {shortcut}
              </span>
            )}
          </div>
        ))}
        <div className="mx-1 flex items-start gap-2 rounded-md bg-white/[0.07] px-1.5 py-1.5 text-[9px] sm:text-[10.5px]">
          <Copy className="mt-0.5 h-3 w-3 shrink-0 text-gray-200" strokeWidth={2} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-gray-100">Run in duplicates</span>
            <span className="hidden truncate text-[9px] text-gray-400 sm:block">
              Run in 3 copies at once, keep the best
            </span>
          </span>
          <span className="hidden shrink-0 items-center gap-1.5 text-gray-400 min-[360px]:flex">
            <span>−</span>
            <span className="tabular-nums text-gray-200">3</span>
            <span>+</span>
          </span>
        </div>
      </div>

      <div className="flex items-end gap-2 rounded-lg border border-[#333] bg-[#222] py-1.5 pl-2.5 pr-1.5">
        <span className="min-w-0 flex-1 truncate py-0.5 text-[9px] text-gray-200 sm:text-[10.5px]">
          Cache product search results for 60 seconds
        </span>
        <span className="flex shrink-0 items-center rounded-md bg-[#e5e5e5] text-[#1a1a1a]">
          <span className="flex h-5 w-6 items-center justify-center">
            <ArrowUp className="h-3 w-3" strokeWidth={2.5} />
          </span>
          <span className="h-3 w-px bg-black/20" />
          <span className="flex h-5 w-5 items-center justify-center rounded-r-md bg-black/10">
            <ChevronUp className="h-3 w-3" strokeWidth={2.5} />
          </span>
        </span>
      </div>
    </div>
  );
}
