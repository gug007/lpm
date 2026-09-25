import { Fragment, type ReactNode } from "react";
import { ArrowDown, ArrowRight, ShieldCheck } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { FLOW_STAGES } from "./numbers-flow-data";
import NumbersFlowStage from "./numbers-flow-stage";
import { CLAUDE_DOT, CODEX_DOT, INLINE_CODE } from "./page-styles";

const SETUP_CARDS: { dot: string; title: string; body: ReactNode }[] = [
  {
    dot: CODEX_DOT,
    title: "Codex: nothing to set up.",
    body: "lpm reads the limits Codex writes to its session files on this Mac, whichever terminal you ran it in, so if you've used Codex before its meters can appear as soon as lpm opens. Some plans report only a weekly window.",
  },
  {
    dot: CLAUDE_DOT,
    title: "Claude Code: one click.",
    body: (
      <>
        Open Usage and press Enable on the Claude card. lpm wraps the
        statusline in{" "}
        <code className={INLINE_CODE}>~/.claude/settings.json</code> so it
        forwards the 5-hour and weekly readings from Claude Code sessions in
        lpm terminals, and your own statusline keeps running inside it. Only
        Pro and Max logins report these windows. Turning it off restores your
        previous statusline exactly.
      </>
    ),
  },
];

export default function NumbersFlow() {
  return (
    <section id="how-it-works" className="py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeader
          eyebrow="Private by design"
          title="Where lpm gets the numbers"
          description="Everything comes from files and readings already on your Mac, and lpm never asks Anthropic or OpenAI for any of it."
          className="mb-12"
        />

        <figure className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:gap-4">
          {FLOW_STAGES.map((stage, index) => (
            <Fragment key={stage.title}>
              {index > 0 && (
                <div
                  aria-hidden
                  className="flex items-center justify-center text-gray-400 dark:text-gray-500"
                >
                  <ArrowRight className="hidden h-5 w-5 lg:block" />
                  <ArrowDown className="h-5 w-5 lg:hidden" />
                </div>
              )}
              <NumbersFlowStage stage={stage} />
            </Fragment>
          ))}
        </figure>

        <p className="mx-auto mt-6 w-fit max-w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-center text-sm font-medium text-gray-800 sm:rounded-full dark:border-gray-800 dark:text-gray-200">
          <ShieldCheck
            className="mr-1.5 inline h-4 w-4 align-[-3px] text-emerald-600 dark:text-emerald-400"
            aria-hidden
          />
          No account, no API keys, and no requests to Anthropic or OpenAI for
          any of these numbers.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {SETUP_CARDS.map(({ dot, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-gray-200 bg-gray-50/60 p-6 dark:border-gray-800 dark:bg-white/[0.02]"
            >
              <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: dot }}
                />
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {body}
              </p>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-3xl text-pretty text-center text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          Stats and Usage are in the More menu at the bottom of lpm&apos;s
          sidebar; right-click either and choose Move to the sidebar to keep it
          in view. Not counted in Stats: SSH projects, projects on other Macs or
          Linux servers you control from lpm, and sessions outside your lpm
          projects. The 5-hour and weekly meters still include everything that
          counts toward those windows, including claude.ai chat.
        </p>
      </div>
    </section>
  );
}
