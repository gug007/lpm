import { MonitorSmartphone } from "lucide-react";

const CAPSULE =
  "flex items-center gap-1.5 rounded-full border border-gray-200/70 bg-white/85 px-3 py-1.5 shadow-[0_2px_10px_rgba(0,0,0,0.06)] backdrop-blur-md dark:border-white/10 dark:bg-white/[0.06] dark:shadow-none";

const CAPSULE_BODY = (
  <>
    <MonitorSmartphone className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
    <span className="whitespace-nowrap text-[9px] font-medium text-gray-500 dark:text-gray-300">
      Paired
    </span>
    <span className="relative inline-flex h-1.5 w-1.5">
      <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
    </span>
  </>
);

// Two separate connectors on purpose: one base element with sm: overrides
// shifted the line over the Mac window. Each hairline must touch both devices.
export function SyncLink({ animate }: { animate: boolean }) {
  return (
    <>
      <div className="relative flex h-20 w-full items-center justify-center overflow-hidden sm:hidden">
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-300 dark:bg-[#3a3a3c]" />
        {animate && (
          <>
            <span className="absolute left-1/2 h-5 w-px -translate-x-1/2 rounded-full bg-gradient-to-b from-transparent to-emerald-400 [animation:pd-spine-down_2.4s_ease-in-out_infinite]" />
            <span className="absolute left-1/2 h-5 w-px -translate-x-1/2 rounded-full bg-gradient-to-t from-transparent to-emerald-400/70 [animation:pd-spine-up_2.4s_ease-in-out_infinite]" />
          </>
        )}
        <div className={`relative z-10 ${CAPSULE}`}>{CAPSULE_BODY}</div>
      </div>
      <div className="relative z-10 hidden h-72 w-36 shrink-0 overflow-hidden sm:-ml-4 sm:block">
        <div className="absolute left-0 right-0 top-1/2 h-px bg-gray-300 dark:bg-[#3a3a3c]" />
        {animate && (
          <>
            <span className="absolute top-1/2 h-px w-10 -translate-y-1/2 rounded-full bg-gradient-to-r from-transparent to-emerald-400 [animation:pd-spine-right_2.4s_ease-in-out_infinite]" />
            <span className="absolute top-1/2 h-px w-10 -translate-y-1/2 rounded-full bg-gradient-to-l from-transparent to-emerald-400/70 [animation:pd-spine-left_2.4s_ease-in-out_infinite]" />
          </>
        )}
        <div
          className={`absolute left-1/2 top-1/2 z-10 -mt-2 -translate-x-1/2 -translate-y-full ${CAPSULE}`}
        >
          {CAPSULE_BODY}
        </div>
      </div>
    </>
  );
}
