import { SquareTerminal } from "lucide-react";
import { MAC_SURFACE } from "@/components/home/paired-devices-data";

// The phone's placeholder once the Mac has taken the terminal back
// (ControlHandoffView in the iOS app).
export function PhoneHandoff() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <SquareTerminal className="h-7 w-7 text-gray-500" />
      <span className="mt-1 text-[12px] font-semibold text-gray-100">
        Active on {MAC_SURFACE}
      </span>
      <span className="text-[9.5px] leading-snug text-gray-400">
        This terminal is shown and controlled elsewhere.
      </span>
      <span className="mt-1.5 rounded-full bg-[#0a84ff] px-3.5 py-1 text-[10px] font-semibold text-white">
        Take control
      </span>
    </div>
  );
}
