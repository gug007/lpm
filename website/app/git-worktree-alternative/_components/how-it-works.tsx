import Link from "next/link";
import { SectionHeader } from "@/components/section-header";
import DialogReplica from "./dialog-replica";
import { HOW_STEPS, type StepPart } from "./dialog-data";
import { INLINE_CODE } from "./page-styles";

const STEP_LINK =
  "font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 transition-colors hover:decoration-gray-900 dark:text-gray-100 dark:decoration-gray-700 dark:hover:decoration-gray-100";

function renderPart(part: StepPart, key: number) {
  if (typeof part === "string") return part;
  if ("href" in part) {
    return (
      <Link key={key} href={part.href} className={STEP_LINK}>
        {part.text}
      </Link>
    );
  }
  return (
    <code key={key} className={INLINE_CODE}>
      {part.code}
    </code>
  );
}

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeader
          eyebrow="How lpm Duplicate works"
          title="One dialog instead of a worktree setup script"
          description="Set the count, the options and the task once, and lpm makes each copy and starts the task in it."
          className="mb-12"
        />

        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:gap-14">
          <ol className="mx-auto max-w-2xl space-y-8 lg:sticky lg:top-24 lg:mx-0 lg:max-w-none lg:pt-4">
            {HOW_STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 font-mono text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-900/60"
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="pt-1 text-base font-semibold text-gray-900 dark:text-gray-100">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                    {step.body.map(renderPart)}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <figure className="min-w-0">
            <DialogReplica />
            <figcaption className="mx-auto mt-4 max-w-md text-pretty text-center text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              The Duplicate dialog, as it appears in lpm. Try the stepper.
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
