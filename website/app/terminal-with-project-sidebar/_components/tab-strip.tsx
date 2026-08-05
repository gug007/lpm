"use client";

import { SESSIONS, projectByKey } from "./walkthrough-data";

type Props = {
  activeId: string;
  onSelect: (id: string) => void;
};

/**
 * The honest baseline: one flat row of tabs holding the same nine sessions,
 * each already prefixed with the project it belongs to, in creation order.
 */
export function TabStrip({ activeId, onSelect }: Props) {
  return (
    <div className="relative shrink-0">
      <div
        role="group"
        aria-label="Terminal sessions"
        className="scrollbar-none flex items-stretch gap-px overflow-x-auto border-b border-[#2e2e2e] bg-[#141414] px-1.5 pt-1.5"
      >
        {SESSIONS.map((session) => {
          const active = session.id === activeId;
          return (
            <button
              key={session.id}
              type="button"
              data-focus={active ? "active-session" : undefined}
              aria-current={active ? "true" : undefined}
              onClick={() => onSelect(session.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-t-md border-x border-t px-3 py-1.5 text-[12px] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-inset focus-visible:outline-none ${
                active
                  ? "border-[#3a3a3a] bg-[#1e1e1e] text-[#e5e5e5]"
                  : "border-transparent text-[#b3b3b3] hover:bg-[#1b1b1b] hover:text-[#e5e5e5]"
              }`}
            >
              <span className="text-[#949494]">
                {projectByKey(session.project).name}
              </span>
              <span aria-hidden className="text-[#6f6f6f]">
                ·
              </span>
              <span>{session.title}</span>
            </button>
          );
        })}
      </div>
      {/* On a phone the row runs past the edge; fade the cut so it reads as
          scrollable instead of ending there. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-0 bottom-px w-10 bg-gradient-to-l from-[#141414] to-transparent md:hidden"
      />
    </div>
  );
}
