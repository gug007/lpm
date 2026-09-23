import type { ReactNode } from "react";
import { TerminalLine, type Line } from "@/components/terminal-line";
import { STATE_TONE, type AgentState } from "./visual-data";

type Tab = {
  glyph: string;
  glyphClass: string;
  title: string;
  state?: AgentState;
  active?: boolean;
  display?: string;
};

type Props = {
  tabs: Tab[];
  lines: Line[];
  className?: string;
  children?: ReactNode;
};

export default function VisualPane({ tabs, lines, className = "", children }: Props) {
  return (
    <div className={`relative flex min-h-0 min-w-0 flex-col bg-[#1a1a1a] ${className}`}>
      <div className="flex h-7 shrink-0 items-end gap-0.5 overflow-hidden border-b border-[#2d2d2d] bg-[#161616] px-1.5 sm:h-8">
        {tabs.map((tab) => (
          <span
            key={tab.title}
            className={`${tab.display ?? "flex"} min-w-0 max-w-[11rem] items-center gap-1.5 rounded-t-md px-2 py-1 text-[9px] sm:text-[10.5px] ${
              tab.active
                ? "bg-[#1f1f1f] text-gray-100 ring-1 ring-inset ring-[#2d2d2d]"
                : "text-gray-500"
            }`}
          >
            <span className={`shrink-0 ${tab.glyphClass}`}>{tab.glyph}</span>
            <span className={`truncate ${tab.state ? STATE_TONE[tab.state] : ""}`}>
              {tab.title}
            </span>
          </span>
        ))}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-3 py-2.5 font-mono leading-[1.35rem] [mask-image:linear-gradient(to_right,#000_90%,transparent)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-[#1a1a1a] to-transparent" />
        {lines.map((l, i) => (
          <TerminalLine
            key={i}
            line={l}
            size="text-[9px] sm:text-[10px]"
            fallback="text-gray-300"
            gapClass="mt-2"
          />
        ))}
      </div>
      {children}
    </div>
  );
}
