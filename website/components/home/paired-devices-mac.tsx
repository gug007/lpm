import type { ReactNode } from "react";
import { TerminalLine, type Line } from "@/components/terminal-line";
import {
  LIGHT,
  PROJECTS,
  TABS,
} from "@/components/home/paired-devices-data";
import { MacHandoff } from "@/components/home/paired-devices-mac-handoff";

type Props = {
  controlled: boolean;
  taking: boolean;
  visible: Line[];
  status: ReactNode;
  working: boolean;
};

// A MacBook running a mini lpm window: projects sidebar, the pane's terminal
// tabs, and the Claude Code session with its own composer — or, while the
// phone holds the terminal, the app's "Active in iPhone" placeholder.
export function MacReplica({
  controlled,
  taking,
  visible,
  status,
  working,
}: Props) {
  return (
    <div className="relative w-full min-w-0 max-w-[32rem] lg:max-w-[38rem]">
      <div className="mx-auto w-[94%] overflow-hidden rounded-t-xl bg-[#111113] p-1.5 pb-0 shadow-2xl shadow-gray-300/60 ring-1 ring-black/15 dark:shadow-black/60 dark:ring-[#3a3a3c]">
        <div className="flex h-[20rem] flex-col overflow-hidden rounded-t-md bg-[#1a1a1a] lg:h-[22rem]">
          <div className="relative flex h-7 shrink-0 items-center border-b border-[#2d2d2d] px-2.5">
            <div className="flex gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
              <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
              <span className="h-2 w-2 rounded-full bg-[#28c840]" />
            </div>
            <span className="absolute left-1/2 -translate-x-1/2 text-[10px] text-gray-400">
              lpm
            </span>
          </div>
          <div className="flex min-h-0 flex-1">
            {/* Projects sidebar */}
            <div className="flex w-[7rem] shrink-0 flex-col gap-0.5 border-r border-[#262626] bg-[#161616] p-1.5">
              <span className="px-1.5 pb-1 pt-0.5 text-[7px] font-semibold uppercase tracking-[0.14em] text-gray-600">
                Projects
              </span>
              {PROJECTS.map((p) => (
                <span
                  key={p.name}
                  className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[9px] ${
                    p.active
                      ? "bg-white/[0.07] text-gray-200"
                      : "text-gray-500"
                  }`}
                >
                  <span
                    className={`h-[5px] w-[5px] shrink-0 rounded-full ${
                      p.running
                        ? "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.7)]"
                        : "border border-[#454545]"
                    }`}
                  />
                  {p.name}
                </span>
              ))}
            </div>
            {/* Terminal pane */}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-0.5 border-b border-[#2d2d2d] bg-[#222222] px-1.5 py-1">
                {TABS.map((tab, i) => (
                  <span
                    key={tab}
                    className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px] ${
                      i === 0 ? "bg-white/[0.1] text-gray-200" : "text-[#8e8e8e]"
                    }`}
                  >
                    {i === 0 && (
                      <span className="h-1 w-1 rounded-full bg-emerald-400" />
                    )}
                    {tab}
                  </span>
                ))}
              </div>
              {controlled ? (
                <>
                  <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-3 py-2.5 font-mono text-[9px] leading-5 sm:text-[10.5px] lg:text-[11.5px] [mask-image:linear-gradient(to_right,#000_92%,transparent)] [-webkit-mask-image:linear-gradient(to_right,#000_92%,transparent)]">
                    {visible.map((l, i) => (
                      <TerminalLine
                        key={i}
                        line={l}
                        size="text-[9px] sm:text-[10.5px] lg:text-[11.5px]"
                        fallback={LIGHT}
                      />
                    ))}
                    {status}
                  </div>
                  {/* Claude Code's own composer: ❯ prompt between ─ rules */}
                  <div className="shrink-0 px-3 pb-2 font-mono">
                    <div className="border-y border-[#6b6b70] py-[3px]">
                      <div className="flex items-center gap-1.5 text-[9px] sm:text-[10.5px] lg:text-[11.5px]">
                        <span className="text-gray-300">❯</span>
                        <span className="inline-block h-3 w-1.5 bg-gray-500 [animation:pd-blink_1.05s_steps(1)_infinite]" />
                        <span className="whitespace-pre text-gray-600">
                          Try &quot;fix typecheck errors&quot;
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between pt-1 text-[7px] sm:text-[8px]">
                      <span className="text-gray-600">
                        {working ? "esc to interrupt" : "? for shortcuts"}
                      </span>
                      <span className="text-[#af87ff]">⏵⏵ accept edits on</span>
                    </div>
                  </div>
                </>
              ) : (
                <MacHandoff taking={taking} />
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Aluminum deck */}
      <div className="relative h-2.5 w-full rounded-b-lg bg-gradient-to-b from-[#e7e8ea] via-[#c9cbcd] to-[#9fa1a4] shadow-lg shadow-gray-400/30 dark:from-[#48484c] dark:via-[#333336] dark:to-[#1f1f22] dark:shadow-black/60">
        <span className="absolute left-1/2 top-0 h-[5px] w-14 -translate-x-1/2 rounded-b-md bg-[#b7b9bc] dark:bg-[#28282b]" />
      </div>
    </div>
  );
}
