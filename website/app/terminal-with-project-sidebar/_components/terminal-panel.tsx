"use client";

import type { ReactNode } from "react";
import type { WalkthroughSession } from "./walkthrough-data";

type Props = {
  session: WalkthroughSession;
  /** The active project's other terminals, shown as tabs inside the project. */
  siblings?: WalkthroughSession[];
  onSelectSession?: (id: string) => void;
  header?: ReactNode;
};

export function TerminalPanel({
  session,
  siblings,
  onSelectSession,
  header,
}: Props) {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[#181818]">
      {header}
      {siblings && siblings.length > 0 && (
        <div
          role="group"
          aria-label="Terminals in this project"
          className="scrollbar-none flex shrink-0 gap-px overflow-x-auto border-b border-[#2e2e2e] bg-[#141414] px-1.5 pt-1.5"
        >
          {siblings.map((sibling) => {
            const active = sibling.id === session.id;
            return (
              <button
                key={sibling.id}
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() => onSelectSession?.(sibling.id)}
                className={`shrink-0 rounded-t-md border-x border-t px-3 py-1.5 text-[12px] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-inset focus-visible:outline-none ${
                  active
                    ? "border-[#3a3a3a] bg-[#181818] text-[#e5e5e5]"
                    : "border-transparent text-[#b3b3b3] hover:bg-[#1b1b1b] hover:text-[#e5e5e5]"
                }`}
              >
                {sibling.title}
              </button>
            );
          })}
        </div>
      )}
      <div className="relative min-h-[9.5rem] flex-1 overflow-x-auto px-4 py-3 font-mono text-[12px] leading-relaxed sm:min-h-[11rem]">
        {session.lines.map((line, index) => (
          <p
            key={`${session.id}-${index}`}
            className={
              line.startsWith("$")
                ? "whitespace-pre text-[#d4d4d4]"
                : "whitespace-pre text-[#8f8f8f]"
            }
          >
            {line}
          </p>
        ))}
        {session.draft && (
          <p className="whitespace-pre text-[#d4d4d4]">
            <span className="text-[#4ade80]">$ </span>
            {session.draft}
            <span
              aria-hidden
              className="animate-caret-blink ml-px inline-block h-3.5 w-[7px] translate-y-[2px] bg-[#d4d4d4]"
            />
            <span className="sr-only"> (half-typed, not run)</span>
          </p>
        )}
      </div>
    </div>
  );
}
