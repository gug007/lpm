import type { ReactNode } from "react";
import {
  ArrowUp,
  BatteryFull,
  ChevronLeft,
  Ellipsis,
  Signal,
  Wifi,
} from "lucide-react";
import { TerminalLine, type Line } from "@/components/terminal-line";
import { LIGHT, PROJECTS } from "@/components/home/paired-devices-data";
import { PhoneHandoff } from "@/components/home/paired-devices-phone-handoff";
import { PhoneLock } from "@/components/home/paired-devices-phone-lock";

type Props = {
  open: boolean;
  controlled: boolean;
  notified: boolean;
  pressed: boolean;
  visible: Line[];
  status: ReactNode;
  typed: string;
  isTyping: boolean;
};

const KEYS = ["esc", "tab", "⌃C", "⏎"];

// iPhone 17 Pro proportions, running lpm link: the lock screen until the push
// arrives, then the terminal it opens, with the app's composer under it while
// the phone is the one in control.
export function PhoneReplica({
  open,
  controlled,
  notified,
  pressed,
  visible,
  status,
  typed,
  isTyping,
}: Props) {
  return (
    <div className="shrink-0">
      <div className="relative aspect-[71.9/150] w-[14.5rem] rounded-[2.6rem] bg-gradient-to-b from-[#48484c] via-[#2b2b2e] to-[#48484c] p-[2px] shadow-xl shadow-gray-400/25 dark:shadow-black/70">
        {/* Side buttons */}
        <span className="absolute -left-[2px] top-24 h-5 w-[2px] rounded-l-sm bg-[#3a3a3c]" />
        <span className="absolute -left-[2px] top-[8.5rem] h-9 w-[2px] rounded-l-sm bg-[#3a3a3c]" />
        <span className="absolute -left-[2px] top-[11.25rem] h-9 w-[2px] rounded-l-sm bg-[#3a3a3c]" />
        <span className="absolute -right-[2px] top-[10rem] h-12 w-[2px] rounded-r-sm bg-[#3a3a3c]" />
        <div className="h-full rounded-[2.5rem] bg-black p-1">
          <div className="relative flex h-full flex-col overflow-hidden rounded-[2.3rem] bg-[#1a1a1a]">
            {/* iOS status bar + Dynamic Island */}
            <div
              className={`absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 pt-2.5 ${
                open ? "" : "justify-end"
              }`}
            >
              {open && (
                <span className="text-[10px] font-semibold tabular-nums text-gray-100">
                  9:41
                </span>
              )}
              <span className="absolute left-1/2 top-1.5 flex h-5 w-16 -translate-x-1/2 items-center justify-end rounded-full bg-black pr-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#16222e]" />
              </span>
              <span className="flex items-center gap-1 text-gray-100">
                <Signal className="h-2.5 w-2.5" strokeWidth={2.5} />
                <Wifi className="h-2.5 w-2.5" strokeWidth={2.5} />
                <BatteryFull className="h-3.5 w-3.5" strokeWidth={1.5} />
              </span>
            </div>

            {open ? (
              <>
                <div className="relative mt-8 flex items-center justify-between px-2.5 pb-1.5">
                  <span className="flex items-center text-[10px] text-[#0a84ff]">
                    <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
                    {PROJECTS[0].name}
                  </span>
                  <span className="absolute left-1/2 -translate-x-1/2 text-[11px] font-semibold text-gray-100">
                    claude
                  </span>
                  <Ellipsis className="h-3.5 w-3.5 text-[#0a84ff]" />
                </div>

                {controlled ? (
                  <>
                    {/* Right edge fades so the narrow screen clips long lines
                        gracefully. */}
                    <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-3 pb-2 font-mono text-[10px] leading-5 [mask-image:linear-gradient(to_right,#000_84%,transparent)] [-webkit-mask-image:linear-gradient(to_right,#000_84%,transparent)]">
                      {visible.map((l, i) => (
                        <TerminalLine key={i} line={l} size="text-[10px]" fallback={LIGHT} />
                      ))}
                      {status}
                    </div>

                    <div className="border-t border-white/[0.06] px-2 pb-4 pt-1.5">
                      <div className="flex gap-1">
                        {KEYS.map((k) => (
                          <span
                            key={k}
                            className="rounded bg-white/[0.08] px-1.5 py-px font-mono text-[8px] text-gray-300"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span
                          className={`flex min-h-7 min-w-0 flex-1 items-center rounded-[14px] border px-2.5 py-1 text-[10px] leading-snug transition-colors ${
                            isTyping
                              ? "border-white/25 bg-white/[0.06]"
                              : "border-white/10 bg-white/[0.03]"
                          }`}
                        >
                          {isTyping ? (
                            <>
                              <span className="min-w-0 text-gray-100">
                                {typed}
                                <span className="ml-px inline-block h-3 w-px bg-[#0a84ff] align-middle [animation:pd-blink_1s_steps(1)_infinite]" />
                              </span>
                            </>
                          ) : (
                            <span className="text-gray-500">Message</span>
                          )}
                        </span>
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors ${
                            isTyping
                              ? "bg-white text-black"
                              : "bg-white/[0.12] text-white/35"
                          }`}
                        >
                          <ArrowUp className="h-3 w-3" strokeWidth={3} />
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <PhoneHandoff />
                )}
              </>
            ) : (
              <PhoneLock notified={notified} pressed={pressed} />
            )}

            {/* Home indicator */}
            <div className="absolute inset-x-0 bottom-0 flex justify-center pb-1.5">
              <span className="h-1 w-20 rounded-full bg-white/25" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
