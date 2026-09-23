import Link from "next/link";
import { BellRing, Gauge, LayoutList, PanelTop } from "lucide-react";
import type { ReactNode } from "react";
import { SectionHeader } from "@/components/section-header";
import { MOBILE_PATH, TOKEN_USAGE_PATH } from "@/lib/links";
import ActivityReplica from "./activity-replica";

const LINK =
  "font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900 dark:text-gray-100 dark:decoration-gray-700 dark:hover:decoration-gray-100";

const ITEMS: { icon: typeof BellRing; title: string; body: ReactNode }[] = [
  {
    icon: PanelTop,
    title: "State on every tab and sidebar row",
    body: (
      <>
        Working shimmers, Needs you pulses amber, Done turns blue and a Problem
        shows red. Sidebar rows and tab tooltips add how long it has lasted,
        like “Working 2m 30s” or “took 4m”. Fold a project’s copies away and
        its row still sums them up.
      </>
    ),
  },
  {
    icon: LayoutList,
    title: "Activity: every Claude Code and Codex session on one screen",
    body: (
      <>
        Press{" "}
        <kbd className="rounded border border-gray-200 px-1 font-sans text-[12px] dark:border-gray-700">
          ⌘⇧A
        </kbd>{" "}
        to list them all across your projects and copies, waiting ones first.
        Filter to needs you, problems, working or done, move with j and k, and
        press Enter to jump to the tab.
      </>
    ),
  },
  {
    icon: BellRing,
    title: "A chime, a banner, a push",
    body: (
      <>
        Hear a sound when an agent finishes, needs approval or hits an error,
        and get a macOS banner naming the tab and project when lpm isn’t in
        front. Pair the free{" "}
        <Link href={MOBILE_PATH} className={LINK}>
          lpm link iPhone app
        </Link>{" "}
        and the same moments arrive as push notifications.
      </>
    ),
  },
  {
    icon: Gauge,
    title: "Pace your plan",
    body: (
      <>
        Parallel runs share your plan limits. A sidebar meter shows your 5-hour
        or weekly window, with a marker for how much of it has passed. Codex
        works right away; Claude needs a one-click opt-in.{" "}
        <Link href={TOKEN_USAGE_PATH} className={LINK}>
          More on usage and limits
        </Link>
        .
      </>
    ),
  },
];

export default function KeepTrack() {
  return (
    <section id="keep-track" className="scroll-mt-20 py-16 sm:py-20">
      <div className="max-w-6xl mx-auto px-6">
        <SectionHeader
          eyebrow="Keep track"
          title="Know which agent needs you without opening every tab"
          description="Every Claude Code and Codex session reports its own state, so you see it in the tab, the sidebar and Activity."
        />
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <figure className="min-w-0">
            <figcaption className="sr-only">
              An illustration of the Activity view: five agents across a
              project, its two copies and a worktree, sorted with the one that
              needs you first, then a problem, two working and one done, each
              with how long it has been in that state.
            </figcaption>
            <ActivityReplica />
          </figure>
          <ul className="space-y-7">
            {ITEMS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-gray-700 ring-1 ring-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-white/[0.06]">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
