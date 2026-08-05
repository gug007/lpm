import { ShowcaseSidebar } from "./showcase-sidebar";
import { ShowcaseWorkspace } from "./showcase-workspace";

const LABEL =
  "The lpm window on macOS. Down the left edge, a project sidebar: a Client work folder holding checkout — selected, running — its worktree checkout-refunds, and billing, then auth-hotfix, whose name has turned amber because Claude Code there needs an answer, marketing-site and infra. The rest of the window belongs to checkout: its actions and a Start button in the header, its three terminals as tabs, and the finished Claude Code session in the open one.";

export function ShowcaseWindow() {
  return (
    <div
      role="img"
      aria-label={LABEL}
      data-nosnippet
      className="overflow-hidden rounded-2xl border border-black/10 bg-[#1a1a1a] shadow-2xl shadow-black/20 ring-1 ring-white/10 select-none sm:rounded-[1.75rem] dark:border-white/10"
    >
      <div aria-hidden className="flex h-[23rem] min-h-0 sm:h-[29rem] lg:h-[36rem]">
        <div className="relative flex shrink-0">
          <ShowcaseSidebar />
          <span className="pointer-events-none absolute inset-y-1.5 left-1.5 right-0 rounded-lg border-2 border-emerald-400/90 shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_0_28px_rgba(52,211,153,0.35)]" />
          <span className="pointer-events-none absolute top-[70%] left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-emerald-950 shadow-lg shadow-emerald-500/20 sm:px-2.5 sm:py-1 sm:text-xs">
            Project sidebar
          </span>
        </div>
        <ShowcaseWorkspace />
      </div>
    </div>
  );
}
