import Link from "next/link";
import type { ReactNode } from "react";
import { SectionHeader } from "@/components/section-header";
import { CLAUDE_ACCOUNTS_PATH, MOBILE_PATH } from "@/lib/links";
import { LimitCard } from "./limit-card";
import { CLAUDE_DOT, CODEX_DOT, LIMIT_CARDS } from "./plan-limits-data";
import { SidebarMeter } from "./sidebar-meter";

const LINK =
  "font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900 dark:text-gray-100 dark:decoration-gray-700 dark:hover:decoration-gray-100";

const SETUP: { dot?: string; title: string; body: ReactNode }[] = [
  {
    dot: CODEX_DOT,
    title: "Codex: nothing to set up",
    body: "Its meters appear the first time you run Codex in a project.",
  },
  {
    dot: CLAUDE_DOT,
    title: "Claude: one click to turn on",
    body: "Press Enable on the Claude card in Usage. Pro and Max logins then report limits from the Claude Code sessions you run in lpm, and your own status line keeps working.",
  },
  {
    title: "One card per account",
    body: (
      <>
        Each{" "}
        <Link href={CLAUDE_ACCOUNTS_PATH} className={LINK}>
          Claude account you pin to a project
        </Link>{" "}
        gets its own card and its own sidebar row.
      </>
    ),
  },
  {
    title: "On your iPhone too",
    body: (
      <>
        The{" "}
        <Link href={MOBILE_PATH} className={LINK}>
          lpm iPhone app
        </Link>{" "}
        has the same Usage and Stats screens.
      </>
    ),
  },
];

export default function PlanLimits() {
  return (
    <section id="limits" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeader
          eyebrow="Plan limits"
          title="See the 5-hour and weekly limits before you hit them"
          description="Live meters for Claude and Codex, each judged against how much of its window has passed — so 60% used means something."
        />

        <div
          data-on-dark
          className="mx-auto max-w-5xl rounded-[2rem] bg-[#0d0d0d] p-4 text-white shadow-2xl shadow-black/10 ring-1 ring-black/10 sm:p-6"
        >
          <p className="sr-only">
            A replica of lpm&rsquo;s Usage window. Claude shows 72% of its
            5-hour window used with 55% of the window gone: ahead of pace, and
            on track to run out about an hour before the reset. Its weekly
            window is 38% used, under pace. Codex is on pace in both windows.
            Below, the sidebar meter shows the weekly window for each tool, with
            a tick marking how much of the week has passed.
          </p>
          <div aria-hidden className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              {LIMIT_CARDS.map((card) => (
                <LimitCard key={card.name} card={card} />
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,17rem)_1fr] md:items-center">
              <SidebarMeter />
              <p className="px-1 text-[13px] leading-relaxed text-white/55 md:px-3">
                The tick is the clock: how much of the window has passed. A bar
                that runs past its tick is spending faster than the window
                refills, and the card says roughly when it will run out.
              </p>
            </div>
          </div>
        </div>

        <ul className="mx-auto mt-6 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SETUP.map(({ dot, title, body }) => (
            <li
              key={title}
              className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800"
            >
              <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                {dot && (
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: dot }}
                  />
                )}
                {title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {body}
              </p>
            </li>
          ))}
        </ul>

        <p className="mx-auto mt-8 max-w-3xl text-center text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          The sidebar meter is on by default and shows the weekly window. Switch
          it to the 5-hour window or whichever is higher, hide a tool you
          don&rsquo;t use, or hover a row for the full card. The numbers are
          what Claude Code and Codex report as they run; lpm never asks
          Anthropic or OpenAI for them.
        </p>
      </div>
    </section>
  );
}
