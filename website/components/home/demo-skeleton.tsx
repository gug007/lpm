import type { ReactNode } from "react";

// The frame's own furniture, drawn rather than photographed. A screenshot here
// would be a picture of some other workspace, so every element would change the
// moment the demo mounted; this holds the exact shape the demo arrives in.
const BAR = "rounded bg-[#2e2e2e] motion-safe:animate-pulse";

export function DemoSkeleton({ status }: { status: ReactNode }) {
  return (
    <div className="flex h-full w-full">
      <div aria-hidden="true" className="hidden w-52 shrink-0 flex-col border-r border-[#2e2e2e] bg-[#1e1e1e] sm:flex lg:w-[260px]">
        <div className="flex h-11 shrink-0 items-center gap-2 px-[14px] pt-[7px]">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="px-4 pb-2 text-xs font-medium uppercase tracking-wider text-[#919191]">
          Projects
        </div>
        <div className="flex flex-col gap-1 px-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2">
              <span className="h-2 w-2 shrink-0 rounded-full border border-[#3a3a3a]" />
              <div className={`${BAR} h-2.5 flex-1`} />
            </div>
          ))}
        </div>
        {/* The footer the sidebar carries, so the column does not visibly grow
            a bottom half the moment the demo arrives. */}
        <div className="mt-auto flex flex-col gap-3 p-3">
          <div className={`${BAR} h-1 w-full`} />
          <div className={`${BAR} h-1 w-full`} />
          <div className={`${BAR} h-3 w-20`} />
          <div className={`${BAR} h-3 w-14`} />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div aria-hidden="true" className="flex shrink-0 items-center gap-4 px-3 py-3">
          <div className={`${BAR} h-4 w-28`} />
          <div className="ml-auto flex items-center gap-2">
            <div className={`${BAR} h-8 w-24`} />
            <div className={`${BAR} h-8 w-20`} />
            <div className={`${BAR} h-8 w-16`} />
          </div>
        </div>
        {/* Near the top: the frame starts low on the page, so its middle is
            below the fold on a laptop. */}
        <div className="flex flex-1 items-start justify-center border-t border-[#2e2e2e] pt-10">
          {status}
        </div>
      </div>
    </div>
  );
}
