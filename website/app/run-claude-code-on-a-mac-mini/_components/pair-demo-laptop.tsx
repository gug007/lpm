import { ChevronRight, LaptopMinimal } from "lucide-react";
import { PairDemoSidebar } from "./pair-demo-sidebar";
import {
  BORDER,
  GROUP,
  GROUP_HEADER,
  HOST_NAME,
  IDLE_TILE,
  MUTED,
  PRIMARY,
  SAS,
  TILE,
} from "./pair-demo-styles";
import type { PairStep } from "./use-pair-sequence";

export function PairDemoLaptop({ step }: { step: PairStep }) {
  if (step === "connected" || step === "running") {
    return <PairDemoSidebar running={step === "running"} />;
  }

  const waiting = step === "waiting" || step === "accept";

  return (
    <>
      <p className={`text-sm font-semibold ${PRIMARY}`}>Add a Mac</p>
      <p className={`mt-0.5 text-[11px] leading-relaxed ${MUTED}`}>
        Connect this Mac to another Mac running lpm.
      </p>

      <p className={`${GROUP_HEADER} mt-4`}>On this network</p>
      <div className={GROUP}>
        <div className="flex items-center gap-3 px-3.5 py-3">
          <span className={TILE} style={IDLE_TILE}>
            <LaptopMinimal size={16} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-sm font-medium ${PRIMARY}`}>
              {HOST_NAME}
            </span>
            {waiting ? (
              <>
                <span className={`block text-[11px] leading-snug ${MUTED}`}>
                  Waiting for approval on {HOST_NAME}
                </span>
                <span
                  className={`mt-1 block font-mono text-base font-semibold tracking-[0.2em] tabular-nums ${PRIMARY}`}
                >
                  {SAS}
                </span>
              </>
            ) : (
              <span className={`block text-[11px] ${MUTED}`}>
                Nearby on this network
              </span>
            )}
          </span>
          {waiting ? (
            <span className={`shrink-0 rounded-md px-2 py-1 text-xs ${MUTED}`}>
              Cancel
            </span>
          ) : (
            <span
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium text-[#22d3ee] transition-all duration-200 ${
                step === "press"
                  ? "scale-95 bg-[#22d3ee]/30"
                  : "bg-[#22d3ee]/[0.12]"
              }`}
            >
              Connect
            </span>
          )}
        </div>
      </div>

      <p className={`${GROUP_HEADER} mt-4`}>Open its projects here</p>
      <div className={GROUP}>
        <div className="flex items-center gap-2 px-3.5 py-3">
          <span
            className={`min-w-0 flex-1 truncate rounded-lg border ${BORDER} bg-[#161616] px-3 py-1.5 text-[12px] text-[#919191]`}
          >
            Paste invite from the other Mac
          </span>
          <span className="shrink-0 rounded-lg bg-[#2a2a2a] px-3 py-1.5 text-[13px] font-medium text-[#9a9a9a]">
            Connect
          </span>
        </div>
        <div
          className={`flex items-center border-t ${BORDER} px-3.5 py-2.5 text-[12px] text-[#b3b3b3]`}
        >
          <span className="flex-1">Enter details manually</span>
          <ChevronRight size={14} className={MUTED} aria-hidden />
        </div>
      </div>
    </>
  );
}
