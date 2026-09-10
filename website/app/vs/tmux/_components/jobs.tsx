import type { ReactNode } from "react";
import { SectionHeader } from "@/components/section-header";

type Job = {
  title: string;
  chip: string;
  body: ReactNode;
};

const JOBS: Job[] = [
  {
    title: "Getting the dev stack up",
    chip: "lpm takes this",
    body: (
      <>
        Every morning: four panes, four commands, in the same order. In lpm that
        is a services map you write once and a Start button, with{" "}
        <code>dependsOn</code> for the ones that must come up first and{" "}
        <code>profiles</code> for the days you only need the front end.
      </>
    ),
  },
  {
    title: "Sessions that outlive the terminal",
    chip: "tmux keeps this",
    body: "If the session lives on a remote box you reach from a laptop, a phone and a machine at the office, tmux on that box is the right tool. lpm drives remote boxes as projects from a Mac; it does not replace a multiplexer you attach to over SSH.",
  },
  {
    title: "Windows, splits and keys",
    chip: "tmux keeps this",
    body: (
      <>
        Prefix keys, copy mode, custom layouts, vim splits. lpm has splits and
        three remappable shortcuts, not a scripting surface. If your{" "}
        <code>.tmux.conf</code> is a pleasure to use, keep it.
      </>
    ),
  },
];

export default function Jobs() {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="Be specific about what you use it for"
          title="tmux does three jobs. lpm replaces one of them."
        />

        <div className="grid gap-4 md:grid-cols-3 text-left">
          {JOBS.map((job) => (
            <article
              key={job.title}
              className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-white/[0.02] p-6"
            >
              <span className="inline-block rounded-full border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium uppercase tracking-widest text-gray-600 dark:text-gray-400">
                {job.chip}
              </span>
              <h3 className="mt-3 font-semibold text-gray-900 dark:text-gray-100">
                {job.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {job.body}
              </p>
            </article>
          ))}
        </div>

        <p className="mt-8 max-w-2xl mx-auto text-center text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          Most people asking for a tmux alternative want job one and have never
          wanted jobs two and three.
        </p>
      </div>
    </section>
  );
}
