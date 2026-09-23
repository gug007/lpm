import { SquareTerminal } from "lucide-react";
import { PHONE_SURFACE } from "@/components/home/paired-devices-data";

// The desktop's placeholder for a terminal the phone controls
// (TerminalHandoffPlaceholder.tsx), with the app's dark-theme cyan.
export function MacHandoff({ taking }: { taking: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2.5 px-4 text-center">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#22d3ee]/10 text-[#22d3ee] ring-1 ring-inset ring-[#22d3ee]/20">
        <SquareTerminal className="h-4 w-4" />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[11px] font-medium text-gray-100 lg:text-[13px]">
          Active in {PHONE_SURFACE}
        </span>
        <span className="max-w-[15rem] text-[9px] leading-snug text-gray-400 lg:max-w-[18rem] lg:text-[11px]">
          This terminal is shown and controlled elsewhere. Take control to move
          it here.
        </span>
      </span>
      <span
        className={`rounded-md border border-[#22d3ee] px-2.5 py-1 text-[9px] font-medium transition-colors lg:px-3 lg:text-[11px] ${
          taking ? "bg-[#22d3ee] text-[#1a1a1a]" : "text-[#22d3ee]"
        }`}
      >
        {taking ? "Taking control…" : "Take control"}
      </span>
    </div>
  );
}
