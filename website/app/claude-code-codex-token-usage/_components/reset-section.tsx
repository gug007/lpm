import type { ReactNode } from "react";
import Link from "next/link";
import { SectionHeader } from "@/components/section-header";
import { AUTOMATIONS_PATH } from "@/lib/links";
import { INLINE_CODE, KBD, TEXT_LINK } from "./page-styles";
import ResetReplica from "./reset-replica";

const STRONG = "font-semibold text-gray-900 dark:text-gray-100";

const STEPS: ReactNode[] = [
  "Write the prompt in the terminal's composer, as usual.",
  <>
    Press <kbd className={KBD}>⌥</kbd>
    <kbd className={`${KBD} ml-0.5`}>↵</kbd>, or open the Send menu&apos;s arrow and choose{" "}
    <strong className={STRONG}>Send later</strong>.
  </>,
  <>
    Click <strong className={STRONG}>Limit resets</strong>, a flag on the timeline or a button under it
    when the reset is further out, or type{" "}
    <code className={INLINE_CODE}>reset</code> in the time field.
  </>,
  <>
    lpm sends it 30 seconds after the reset, once the agent is idle and waiting for input. Scheduled
    prompts wait under <strong className={STRONG}>History › Scheduled</strong>, where you can send one
    now, edit it or cancel it. A prompt that was missed gets New time and Keep as draft instead.
  </>,
];

const QUESTIONS = [
  {
    title: "Which limit does it wait for?",
    body: "The one that's blocking you. If a window is used up, lpm waits for it, and if both are, for the one that resets last, which can be the weekly limit. Otherwise it follows the 5-hour window. The reading comes from the account that terminal's agent runs as.",
  },
  {
    title: "lpm or Claude Code's automatic continue?",
    body: "Claude Code 2.1.234 and later can wait in the open session and pick the interrupted task back up after the reset. That's the easy path for finishing one task. Use lpm when the next step is a different prompt, when the agent is Codex, or when you want every waiting prompt in one list.",
  },
];

export default function ResetSection() {
  return (
    <section id="limit-reached" className="py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeader
          eyebrow="Limit reached"
          title="Claude Code or Codex usage limit reached? Send the next prompt when it resets"
          description="Write the next prompt anyway. lpm holds it and sends it 30 seconds after the limit resets, once Claude Code or Codex is ready for it."
          className="mb-12"
        />

        <div className="grid items-start gap-10 lg:grid-cols-2">
          <div className="mx-auto w-full max-w-2xl lg:mx-0 lg:max-w-none">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              How to queue a prompt for the reset
            </h3>
            <ol className="mt-5 space-y-4">
              {STEPS.map((step, index) => (
                <li key={index} className="flex gap-3">
                  <span
                    aria-hidden
                    className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gray-300 font-mono text-xs font-semibold text-gray-600 dark:border-gray-700 dark:text-gray-300"
                  >
                    {index + 1}
                  </span>
                  <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">{step}</p>
                </li>
              ))}
            </ol>

            <div className="mt-8 space-y-6">
              {QUESTIONS.map((q) => (
                <div key={q.title}>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{q.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{q.body}</p>
                </div>
              ))}
            </div>
          </div>

          <figure className="mx-auto w-full min-w-0 max-w-[34rem] lg:mx-0 lg:max-w-none">
            <ResetReplica />
            <figcaption className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
              Send later in lpm, with a sample clock. The Limit resets flag appears when the
              terminal&apos;s agent has a live limit reading.
            </figcaption>
          </figure>
        </div>

        <p className="mx-auto mt-12 max-w-3xl text-pretty text-center text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          Works in local Claude Code and Codex terminals that have a live limit reading, not over SSH
          or on another Mac. lpm has to be open and the Mac awake when the prompt comes
          due: if lpm is closed or the Mac is asleep more than 5 minutes past that time, the prompt
          is marked Missed instead of sent. For prompts on a timetable,{" "}
          <Link href={AUTOMATIONS_PATH} className={TEXT_LINK}>
            schedule recurring Claude Code and Codex runs
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
