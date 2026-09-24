import { Bell, Check } from "lucide-react";
import { AGENT_COUNT, SERVICE_COUNT, WINDOWS } from "./before-after-data";

// Both sides are counted in the same units: the same services and agents, in
// one window per process or in one window.
export const WINDOW_COUNT = { before: `${WINDOWS.length} windows`, after: "1 window" };

export function CountLine({ side }: { side: keyof typeof WINDOW_COUNT }) {
  return (
    <span className="font-mono text-[12.5px] leading-[1.4] tracking-tight tabular-nums text-gray-500 dark:text-gray-400">
      <b className="font-semibold text-gray-900 dark:text-white">{WINDOW_COUNT[side]}</b>
      {` · ${SERVICE_COUNT} services · ${AGENT_COUNT} agents`}
    </span>
  );
}

const PILL =
  "inline-flex h-6 items-center gap-[5px] rounded-full border border-gray-200 px-2.5 text-xs font-medium dark:border-white/10";

// The three states an agent row shows in the sidebar, named in the app's own
// colours. The shimmer's hues are darkened on white so the word stays legible.
export function StateLegend() {
  return (
    <p className="flex flex-wrap justify-center gap-1.5">
      <span className={`${PILL} text-amber-700 dark:text-amber-400`}>
        <Bell aria-hidden="true" className="h-3 w-3" strokeWidth={2.25} />
        Needs you
      </span>
      <span className={PILL}>
        <span className="bg-[linear-gradient(90deg,#2563eb,#7c3aed_55%,#be185d)] bg-clip-text text-transparent dark:bg-[linear-gradient(90deg,#60a5fa,#a78bfa_55%,#f472b6)]">
          Working
        </span>
      </span>
      <span className={`${PILL} text-blue-600 dark:text-blue-400`}>
        <Check aria-hidden="true" className="h-3 w-3" strokeWidth={2.5} />
        Done
      </span>
    </p>
  );
}
